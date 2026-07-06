from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Workspace, WorkspaceMember, Message
import requests
from rest_framework.permissions import IsAuthenticated
from .serializers import WorkspaceSerializer

class WorkspaceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Return workspaces owned by the user
        return Workspace.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        # Automatically set the owner to the logged-in user
        serializer.save(owner=self.request.user)

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
