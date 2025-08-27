from rest_framework import serializers
from .models import Project, File, Node, Edge

class FileSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = '__all__'

class NodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        fields = '__all__'

class EdgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = '__all__'

class ProjectSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)  # NEW
    files = FileSerializer(many=True, read_only=True)
    nodes = NodeSerializer(many=True, read_only=True)
    edges = EdgeSerializer(many=True, read_only=True)
    class Meta:
        model = Project
        fields = '__all__'
