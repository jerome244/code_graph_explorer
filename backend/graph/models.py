from django.db import models

class Project(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

class File(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='files')
    path = models.CharField(max_length=1024)
    language = models.CharField(max_length=20)  # c, h, py, js, css, html
    size = models.IntegerField(default=0)
    sha1 = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        unique_together = ('project', 'path')

class Node(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='nodes')
    file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='node')
    label = models.CharField(max_length=255)
    kind = models.CharField(max_length=50, default='file')  # future: class/function/module

    class Meta:
        unique_together = ('project', 'file')

class Edge(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='edges')
    source = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='out_edges')
    target = models.ForeignKey(Node, on_delete=models.CASCADE, related_name='in_edges')
    relation = models.CharField(max_length=50)  # imports, includes, links, uses