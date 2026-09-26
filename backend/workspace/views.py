from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Workspace, WorkspaceMember, Message, WorkspaceFile
from django.db.models import Q
import requests
from rest_framework.permissions import IsAuthenticated
from .serializers import WorkspaceSerializer, WorkspaceFileSerializer
import subprocess

class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Return workspaces owned by the user OR where the user is a member
        return Workspace.objects.filter(
            Q(owner=self.request.user) | Q(memberships__user=self.request.user)
        ).distinct()

    def perform_create(self, serializer):
        workspace = serializer.save(owner=self.request.user)
        # Auto-create main.py for new workspaces
        WorkspaceFile.objects.create(
            workspace=workspace,
            name="main.py",
            content="# Welcome to your collaborative Python workspace\n\ndef hello_world():\n    print(\"Hello from Collab!\")\n\nhello_world()\n"
        )

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

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        try:
            workspace = self.get_object()
            messages = workspace.messages.all().order_by('created_at')
            data = [{
                'id': msg.id,
                'content': msg.content,
                'sender_id': msg.sender.id if msg.sender else None,
                'sender_email': msg.sender.email if msg.sender else 'Unknown',
                'created_at': msg.created_at
            } for msg in messages]
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class WorkspaceFileViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceFileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Users can only see files in workspaces they own or are members of
        workspace_id = self.request.query_params.get('workspace')
        qs = WorkspaceFile.objects.filter(
            Q(workspace__owner=self.request.user) | Q(workspace__memberships__user=self.request.user)
        ).distinct()
        
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)
        return qs

    def perform_create(self, serializer):
        # Extract workspace from request body
        workspace_id = self.request.data.get('workspace')
        try:
            workspace = Workspace.objects.get(
                Q(id=workspace_id) &
                (Q(owner=self.request.user) | Q(memberships__user=self.request.user))
            )
            serializer.save(workspace=workspace)
        except Workspace.DoesNotExist:
            raise serializers.ValidationError({"workspace": "Invalid workspace or permission denied."})

import os

class ExecuteCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get('code', '')
        filename = request.data.get('filename', 'main.py')
        
        try:
            ext = filename.split('.')[-1]
            stdout, stderr = "", ""
            
            if ext == 'py':
                docker_cmd = [
                    "docker", "run", "--rm", "-i", 
                    "--network", "none", "--memory=128m", "--cpus=0.5",
                    "--user", "1000:1000", "--pids-limit", "20",
                    "python:3.10-alpine", "python", "-"
                ]
                result = subprocess.run(docker_cmd, input=code, capture_output=True, text=True, timeout=5)
                stdout, stderr = result.stdout, result.stderr
            
            elif ext == 'js':
                docker_cmd = [
                    "docker", "run", "--rm", "-i", 
                    "--network", "none", "--memory=128m", "--cpus=0.5",
                    "--user", "1000:1000", "--pids-limit", "20",
                    "node:18-alpine", "node", "-"
                ]
                result = subprocess.run(docker_cmd, input=code, capture_output=True, text=True, timeout=5)
                stdout, stderr = result.stdout, result.stderr
                
            elif ext == 'cpp':
                # For C++, we pipe a shell script that writes stdin to /tmp/main.cpp, compiles it, and runs it
                docker_cmd = [
                    "docker", "run", "--rm", "-i", 
                    "--network", "none", "--memory=256m", "--cpus=1.0",
                    "--user", "1000:1000", "--pids-limit", "20",
                    "gcc:latest", "sh", "-c", "cat > /tmp/main.cpp && g++ /tmp/main.cpp -o /tmp/main && /tmp/main"
                ]
                result = subprocess.run(docker_cmd, input=code, capture_output=True, text=True, timeout=10)
                stdout, stderr = result.stdout, result.stderr
            else:
                return Response({"error": f"Unsupported language extension: .{ext}"}, status=400)

            return Response({
                "stdout": stdout,
                "stderr": stderr
            })
            
        except subprocess.TimeoutExpired:
            return Response({"error": "Execution timed out (5s limit)"}, status=400)
        except FileNotFoundError:
            # The docker CLI is missing, e.g. on hosts like Render that don't allow running containers
            return Response({"error": "Code execution is unavailable: Docker is not installed on this server."}, status=503)
        except Exception as e:
            return Response({"error": str(e)}, status=500)
