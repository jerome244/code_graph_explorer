from rest_framework import serializers
from .models import Project, File, Node, Edge

class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = '__all__'

class NodeSerializer(serializers.ModelSerializer):
    file_path = serializers.CharField(source='file.path', read_only=True)  # <- add path

    class Meta:
        model = Node
        fields = ['id','project','file','label','kind','pos_x','pos_y','file_path']

class EdgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = '__all__'

class ProjectSerializer(serializers.ModelSerializer):
    files = FileSerializer(many=True, read_only=True)
    nodes = NodeSerializer(many=True, read_only=True)
    edges = EdgeSerializer(many=True, read_only=True)

    class Meta:
        model = Project
        fields = '__all__'
