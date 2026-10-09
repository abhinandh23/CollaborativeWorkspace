import os

import pytest
from channels.layers import channel_layers
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from workspace.models import Workspace, WorkspaceFile, WorkspaceMember

User = get_user_model()


@pytest.fixture(scope='session')
def django_db_modify_db_settings(django_db_modify_db_settings_parallel_suffix):
    # DATABASE_URL enables persistent connections (conn_max_age); connections opened by
    # async consumer threads would then stay open and block dropping the test database
    from django.conf import settings
    settings.DATABASES['default']['CONN_MAX_AGE'] = 0


@pytest.fixture(autouse=True)
def _test_settings(settings):
    # Fast hashing keeps user creation cheap
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
    # WebSocket tests use an in-memory channel layer unless CI asks for the real Redis
    if os.environ.get('TEST_CHANNEL_LAYER') != 'redis':
        settings.CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
    # Each async test runs on a new event loop; a cached layer would hold locks bound to an old one
    channel_layers.backends.clear()


@pytest.fixture
def make_user(db):
    def _make(email='alice@example.com', password='S3cure-pass!'):
        return User.objects.create_user(username=email.split('@')[0], email=email, password=password)
    return _make


@pytest.fixture
def user(make_user):
    return make_user()


@pytest.fixture
def other_user(make_user):
    return make_user(email='bob@example.com')


@pytest.fixture
def api_client():
    return APIClient()


def client_for(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


@pytest.fixture
def auth_client(user):
    return client_for(user)


@pytest.fixture
def other_client(other_user):
    return client_for(other_user)


@pytest.fixture
def workspace(user):
    ws = Workspace.objects.create(name='Alice WS', owner=user)
    WorkspaceFile.objects.create(workspace=ws, name='main.py', content='print("hi")\n')
    return ws


@pytest.fixture
def membership(workspace, other_user):
    return WorkspaceMember.objects.create(workspace=workspace, user=other_user)
