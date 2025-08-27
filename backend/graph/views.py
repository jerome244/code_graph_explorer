from rest_framework import viewsets, permissions
from .models import Project, File, Node, Edge
from .serializers import ProjectSerializer, FileSerializer, NodeSerializer, EdgeSerializer

# PUBLIC: expose everything, no auth required

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all().order_by('-created_at')
    serializer_class = ProjectSerializer
    permission_classes = [permissions.AllowAny]

class FileViewSet(viewsets.ModelViewSet):
    queryset = File.objects.select_related('project').all()
    serializer_class = FileSerializer
    permission_classes = [permissions.AllowAny]

class NodeViewSet(viewsets.ModelViewSet):
    queryset = Node.objects.select_related('project', 'file').all()
    serializer_class = NodeSerializer
    permission_classes = [permissions.AllowAny]

class EdgeViewSet(viewsets.ModelViewSet):
    queryset = Edge.objects.select_related('project', 'source', 'target').all()
    serializer_class = EdgeSerializer
    permission_classes = [permissions.AllowAny]
