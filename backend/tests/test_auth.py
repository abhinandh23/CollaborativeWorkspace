from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

User = get_user_model()

REGISTER_URL = '/api/users/register/'
LOGIN_URL = '/api/users/login/'
REFRESH_URL = '/api/users/login/refresh/'
GOOGLE_URL = '/api/users/google/'

pytestmark = pytest.mark.django_db


class TestRegister:
    def test_creates_user_with_hashed_password(self, api_client):
        res = api_client.post(REGISTER_URL, {'email': 'new@example.com', 'password': 'pw123456'}, format='json')

        assert res.status_code == 201
        assert res.data['email'] == 'new@example.com'
        assert 'password' not in res.data
        user = User.objects.get(email='new@example.com')
        assert user.username == 'new'
        assert user.check_password('pw123456')

    def test_duplicate_email_rejected(self, api_client, user):
        res = api_client.post(REGISTER_URL, {'email': user.email, 'password': 'x'}, format='json')
        assert res.status_code == 400
        assert 'email' in res.data

    @pytest.mark.parametrize('payload', [
        {'email': 'a@example.com'},
        {'password': 'pw123456'},
        {'email': 'not-an-email', 'password': 'pw123456'},
    ])
    def test_invalid_input_rejected(self, api_client, payload):
        res = api_client.post(REGISTER_URL, payload, format='json')
        assert res.status_code == 400


class TestLogin:
    def test_returns_token_pair(self, api_client, user):
        res = api_client.post(LOGIN_URL, {'email': user.email, 'password': 'S3cure-pass!'}, format='json')
        assert res.status_code == 200
        assert {'access', 'refresh'} <= set(res.data)

    def test_wrong_password(self, api_client, user):
        res = api_client.post(LOGIN_URL, {'email': user.email, 'password': 'wrong'}, format='json')
        assert res.status_code == 401

    def test_missing_fields(self, api_client):
        res = api_client.post(LOGIN_URL, {}, format='json')
        assert res.status_code == 400

    def test_refresh_issues_new_access_token(self, api_client, user):
        tokens = api_client.post(LOGIN_URL, {'email': user.email, 'password': 'S3cure-pass!'}, format='json').data
        res = api_client.post(REFRESH_URL, {'refresh': tokens['refresh']}, format='json')
        assert res.status_code == 200
        assert 'access' in res.data

    def test_refresh_rejects_garbage(self, api_client):
        res = api_client.post(REFRESH_URL, {'refresh': 'not-a-token'}, format='json')
        assert res.status_code == 401

    def test_access_token_grants_api_access(self, api_client, user):
        tokens = api_client.post(LOGIN_URL, {'email': user.email, 'password': 'S3cure-pass!'}, format='json').data
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        assert api_client.get('/api/workspaces/').status_code == 200

    def test_malformed_bearer_token_rejected(self, api_client):
        api_client.credentials(HTTP_AUTHORIZATION='Bearer abc.def.ghi')
        assert api_client.get('/api/workspaces/').status_code == 401


GOOGLE_INFO = {'email': 'gina@gmail.com', 'given_name': 'Gina', 'family_name': 'Lee'}


@pytest.fixture
def google_client_id(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'test-client-id')


@pytest.mark.usefixtures('google_client_id')
class TestGoogleLogin:
    @patch('users.views.id_token.verify_oauth2_token', return_value=GOOGLE_INFO)
    def test_creates_new_user_and_returns_tokens(self, verify, api_client):
        res = api_client.post(GOOGLE_URL, {'credential': 'google-id-token'}, format='json')

        assert res.status_code == 200
        assert {'access', 'refresh', 'user'} <= set(res.data)
        assert res.data['user']['email'] == 'gina@gmail.com'
        # Verified against our own client ID, never a real Google call
        assert verify.call_args.args[0] == 'google-id-token'
        assert verify.call_args.args[2] == 'test-client-id'
        user = User.objects.get(email='gina@gmail.com')
        assert (user.username, user.first_name, user.last_name) == ('gina', 'Gina', 'Lee')
        assert not user.has_usable_password()

    @patch('users.views.id_token.verify_oauth2_token')
    def test_existing_user_is_reused(self, verify, api_client, user):
        verify.return_value = {'email': user.email}
        res = api_client.post(GOOGLE_URL, {'credential': 'tok'}, format='json')

        assert res.status_code == 200
        assert res.data['user']['id'] == str(user.id)
        assert User.objects.filter(email=user.email).count() == 1

    @patch('users.views.id_token.verify_oauth2_token', side_effect=ValueError('Token expired'))
    def test_invalid_token(self, verify, api_client):
        res = api_client.post(GOOGLE_URL, {'credential': 'bad'}, format='json')
        assert res.status_code == 400
        assert 'Invalid token' in res.data['error']
        assert not User.objects.exists()

    def test_missing_credential(self, api_client):
        res = api_client.post(GOOGLE_URL, {}, format='json')
        assert res.status_code == 400
        assert res.data['error'] == 'No credential provided'


def test_google_login_without_client_id_configured(api_client, monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    res = api_client.post(GOOGLE_URL, {'credential': 'tok'}, format='json')
    assert res.status_code == 500
    assert 'GOOGLE_CLIENT_ID' in res.data['error']
