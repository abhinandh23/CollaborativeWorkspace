from rest_framework import serializers
from .models import Workspace, WorkspaceMember, Message

class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ('id', 'name', 'owner', 'content', 'created_at', 'updated_at')
        read_only_fields = ('owner',)
