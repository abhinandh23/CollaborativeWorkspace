from rest_framework import serializers
from .models import Workspace, WorkspaceMember, Message, WorkspaceFile
from users.serializers import UserSerializer

class WorkspaceFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceFile
        fields = ('id', 'workspace', 'name', 'content', 'created_at', 'updated_at')
        read_only_fields = ('workspace',)

class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ('id', 'name', 'owner', 'content', 'created_at', 'updated_at')
        read_only_fields = ('owner',)
