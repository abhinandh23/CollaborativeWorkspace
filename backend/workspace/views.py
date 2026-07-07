from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Workspace, WorkspaceMember, Message
from django.db.models import Q
import requests
from rest_framework.permissions import IsAuthenticated
from .serializers import WorkspaceSerializer

class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Return workspaces owned by the user OR where the user is a member
        return Workspace.objects.filter(
            Q(owner=self.request.user) | Q(memberships__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        # Automatically set the owner to the logged-in user
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['post'])
    def join(self, request):
        workspace_id = request.data.get('workspace_id')
        if not workspace_id:
            return Response({"error": "workspace_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            workspace = Workspace.objects.get(id=workspace_id)
            # Create membership if it doesn't already exist (and if they aren't the owner)
            if workspace.owner != request.user:
                WorkspaceMember.objects.get_or_create(workspace=workspace, user=request.user)
            
            serializer = self.get_serializer(workspace)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found or invalid ID"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

import subprocess

class ExecuteCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get('code', '')
        
        try:
            # For this local learning environment, we execute Python natively via subprocess
            with open("temp_exec.py", "w") as f:
                f.write(code)
                
            result = subprocess.run(["python", "temp_exec.py"], capture_output=True, text=True, timeout=5)
            
            return Response({
                "stdout": result.stdout,
                "stderr": result.stderr
            })
        except subprocess.TimeoutExpired:
            return Response({"error": "Execution timed out (5s limit)"}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=500)
