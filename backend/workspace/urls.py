from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkspaceViewSet, ExecuteCodeView, WorkspaceFileViewSet

router = DefaultRouter()
router.register(r'files', WorkspaceFileViewSet, basename='file')
router.register(r'', WorkspaceViewSet, basename='workspace')

urlpatterns = [
    path('execute/', ExecuteCodeView.as_view(), name='execute-code'),
    path('', include(router.urls)),
]
