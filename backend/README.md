test ws limit

terminal A:
pkill -f daphne  # or Ctrl+C the running one
export GAME_MAX_PLAYERS_PER_SESSION=1
export GAME_MAX_CONN_PER_USER=2   # (per-user cap only applies to logged-in users)
daphne -b 0.0.0.0 -p 8000 config.asgi:application



terminal B:
wscat -c ws://127.0.0.1:8000/ws/game/testroom/



terminal C:
wscat -c ws://127.0.0.1:8000/ws/game/testroom/







{"type":"ping"}
{"type":"join","name":"Alice"}
{"type":"chat","message":"hello everyone"}
{"type":"move","x":1,"y":2,"z":3}
{"type":"place_block","x":0,"y":0,"z":0,"block":"stone"}
{"type":"remove_block","x":0,"y":0,"z":0}





{"type":"chat","message":"B joined!"}
