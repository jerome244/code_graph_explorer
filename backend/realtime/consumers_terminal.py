from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from asyncio.subprocess import create_subprocess_exec, PIPE
import asyncio
import shlex

# NOTE: demo only. In production, run commands in an isolated sandbox (container/VM)
# with strict resource, time, and syscall limits.

class TerminalConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user", AnonymousUser())
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.group_name = f"proj_{self.project_id}:terminal"

        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.accept()
            await self.send_json({"type": "error", "code": "unauthorized", "message": "Authentication required."})
            await self.close(code=4401)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "ready"})

        self.proc = None
        self.tail_task = None

    async def disconnect(self, code):
        if getattr(self, "proc", None) and self.proc.returncode is None:
            try:
                self.proc.terminate()
            except ProcessLookupError:
                pass
        if getattr(self, "tail_task", None):
            self.tail_task.cancel()
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        """
        Client messages:
        - {type: 'run', cmd: string, cwd?: string}
        - {type: 'stdin', data: string}
        - {type: 'stop'}
        """
        kind = content.get("type")

        if kind == "run":
            if getattr(self, "proc", None) and self.proc.returncode is None:
                await self.send_json({"type": "info", "message": "A process is already running; stopping it first."})
                await self._stop_proc()

            cmd = content.get("cmd") or "python -V"
            cwd = content.get("cwd") or None

            try:
                args = shlex.split(cmd)
                self.proc = await create_subprocess_exec(*args, cwd=cwd, stdout=PIPE, stderr=PIPE)
            except Exception as e:
                await self.send_json({"type": "error", "message": f"Failed to start: {e}"})
                return

            await self.send_json({"type": "started", "pid": self.proc.pid, "cmd": cmd})

            async def read_stream(stream, typ):
                try:
                    while True:
                        line = await stream.readline()
                        if not line:
                            break
                        try:
                            txt = line.decode(errors="ignore").rstrip("\n")
                        except Exception:
                            txt = str(line)
                        await self.send_json({"type": typ, "text": txt})
                except asyncio.CancelledError:
                    pass

            self.tail_task = asyncio.gather(
                read_stream(self.proc.stdout, "out"),
                read_stream(self.proc.stderr, "err"),
            )

            async def wait_done():
                rc = await self.proc.wait()
                await self.send_json({"type": "exit", "code": rc})

            asyncio.create_task(wait_done())

        elif kind == "stdin":
            data = content.get("data", "")
            if getattr(self, "proc", None) and self.proc.stdin:
                try:
                    self.proc.stdin.write(data.encode())
                    await self.proc.stdin.drain()
                except Exception:
                    pass

        elif kind == "stop":
            await self._stop_proc()

    async def _stop_proc(self):
        if getattr(self, "proc", None) and self.proc.returncode is None:
            try:
                self.proc.terminate()
                await asyncio.wait_for(self.proc.wait(), timeout=3)
            except asyncio.TimeoutError:
                self.proc.kill()
            except ProcessLookupError:
                pass
        await self.send_json({"type": "stopped"})
