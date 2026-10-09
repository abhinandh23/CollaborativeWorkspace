import uuid

import pytest

from workspace.models import Message, Workspace, WorkspaceFile, WorkspaceMember

pytestmark = pytest.mark.django_db

LIST_URL = '/api/workspaces/'
JOIN_URL = '/api/workspaces/join/'


def detail_url(ws):
    return f'/api/workspaces/{ws.id}/'


class TestAuthRequired:
    @pytest.mark.parametrize('method, url', [
        ('get', LIST_URL),
        ('post', LIST_URL),
        ('post', JOIN_URL),
        ('get', '/api/workspaces/files/'),
        ('post', '/api/workspaces/execute/'),
    ])
    def test_anonymous_requests_rejected(self, api_client, method, url):
        assert getattr(api_client, method)(url).status_code == 401

    def test_anonymous_cannot_read_workspace(self, api_client, workspace):
        assert api_client.get(detail_url(workspace)).status_code == 401
        assert api_client.get(f'{detail_url(workspace)}messages/').status_code == 401


class TestWorkspaceCrud:
    def test_create_sets_owner_and_seeds_main_py(self, auth_client, user):
        res = auth_client.post(LIST_URL, {'name': 'Project X'}, format='json')

        assert res.status_code == 201
        assert set(res.data) == {'id', 'name', 'owner', 'content', 'created_at', 'updated_at'}
        ws = Workspace.objects.get(id=res.data['id'])
        assert ws.owner == user
        assert list(ws.files.values_list('name', flat=True)) == ['main.py']

    def test_owner_field_cannot_be_spoofed(self, auth_client, user, other_user):
        res = auth_client.post(LIST_URL, {'name': 'X', 'owner': str(other_user.id)}, format='json')
        assert res.status_code == 201
        assert Workspace.objects.get(id=res.data['id']).owner == user

    def test_create_requires_name(self, auth_client):
        res = auth_client.post(LIST_URL, {}, format='json')
        assert res.status_code == 400
        assert 'name' in res.data

    def test_name_too_long(self, auth_client):
        res = auth_client.post(LIST_URL, {'name': 'x' * 256}, format='json')
        assert res.status_code == 400

    def test_list_contains_owned_and_joined_only(self, auth_client, user, other_user):
        mine = Workspace.objects.create(name='mine', owner=user)
        joined = Workspace.objects.create(name='joined', owner=other_user)
        WorkspaceMember.objects.create(workspace=joined, user=user)
        Workspace.objects.create(name='strangers', owner=other_user)

        res = auth_client.get(LIST_URL)

        assert res.status_code == 200
        assert {w['name'] for w in res.data} == {mine.name, joined.name}

    def test_list_has_no_duplicates_with_several_members(self, auth_client, workspace, make_user):
        for i in range(3):
            WorkspaceMember.objects.create(workspace=workspace, user=make_user(email=f'm{i}@example.com'))
        assert len(auth_client.get(LIST_URL).data) == 1

    def test_retrieve_update_delete_own_workspace(self, auth_client, workspace):
        assert auth_client.get(detail_url(workspace)).data['name'] == 'Alice WS'

        res = auth_client.patch(detail_url(workspace), {'name': 'Renamed'}, format='json')
        assert res.status_code == 200
        workspace.refresh_from_db()
        assert workspace.name == 'Renamed'

        assert auth_client.delete(detail_url(workspace)).status_code == 204
        assert not Workspace.objects.filter(id=workspace.id).exists()
        assert not WorkspaceFile.objects.filter(workspace_id=workspace.id).exists()

    @pytest.mark.parametrize('method', ['get', 'patch', 'delete'])
    def test_non_member_gets_404(self, other_client, workspace, method):
        res = getattr(other_client, method)(detail_url(workspace), {'name': 'hacked'}, format='json')
        assert res.status_code == 404
        workspace.refresh_from_db()
        assert workspace.name == 'Alice WS'

    def test_member_can_read(self, other_client, workspace, membership):
        assert other_client.get(detail_url(workspace)).status_code == 200


class TestJoin:
    def test_join_creates_membership(self, other_client, other_user, workspace):
        res = other_client.post(JOIN_URL, {'workspace_id': str(workspace.id)}, format='json')

        assert res.status_code == 200
        assert res.data['id'] == str(workspace.id)
        assert WorkspaceMember.objects.filter(workspace=workspace, user=other_user, access_level='editor').exists()

    def test_join_twice_is_idempotent(self, other_client, workspace):
        for _ in range(2):
            other_client.post(JOIN_URL, {'workspace_id': str(workspace.id)}, format='json')
        assert WorkspaceMember.objects.filter(workspace=workspace).count() == 1

    def test_owner_joining_own_workspace_adds_no_membership(self, auth_client, workspace):
        assert auth_client.post(JOIN_URL, {'workspace_id': str(workspace.id)}, format='json').status_code == 200
        assert not WorkspaceMember.objects.exists()

    def test_missing_id(self, auth_client):
        res = auth_client.post(JOIN_URL, {}, format='json')
        assert res.status_code == 400
        assert res.data['error'] == 'workspace_id is required'

    def test_unknown_id(self, auth_client):
        res = auth_client.post(JOIN_URL, {'workspace_id': str(uuid.uuid4())}, format='json')
        assert res.status_code == 404

    def test_malformed_id(self, auth_client):
        res = auth_client.post(JOIN_URL, {'workspace_id': 'not-a-uuid'}, format='json')
        assert res.status_code == 400
        assert 'error' in res.data


class TestChatHistory:
    def test_returns_messages_oldest_first(self, auth_client, user, other_user, workspace):
        Message.objects.create(workspace=workspace, sender=user, content='first')
        Message.objects.create(workspace=workspace, sender=other_user, content='second')
        Message.objects.create(workspace=workspace, sender=None, content='ghost')

        res = auth_client.get(f'{detail_url(workspace)}messages/')

        assert res.status_code == 200
        assert [m['content'] for m in res.data] == ['first', 'second', 'ghost']
        assert res.data[0]['sender_email'] == user.email
        assert res.data[0]['sender_id'] == user.id
        assert res.data[2]['sender_email'] == 'Unknown'
        assert set(res.data[0]) == {'id', 'content', 'sender_id', 'sender_email', 'created_at'}

    def test_member_can_read_history(self, other_client, workspace, membership):
        Message.objects.create(workspace=workspace, content='hello')
        assert len(other_client.get(f'{detail_url(workspace)}messages/').data) == 1

    def test_non_member_cannot_read_history(self, other_client, workspace):
        Message.objects.create(workspace=workspace, content='secret')
        res = other_client.get(f'{detail_url(workspace)}messages/')
        # The view wraps get_object() in a broad except, so the 404 surfaces as a 400
        assert res.status_code == 400
        assert 'secret' not in str(res.data)


class TestFiles:
    URL = '/api/workspaces/files/'

    def test_list_filtered_by_workspace(self, auth_client, user, workspace):
        other_ws = Workspace.objects.create(name='other', owner=user)
        WorkspaceFile.objects.create(workspace=other_ws, name='b.js')

        res = auth_client.get(self.URL, {'workspace': str(workspace.id)})

        assert res.status_code == 200
        assert [f['name'] for f in res.data] == ['main.py']
        assert set(res.data[0]) == {'id', 'workspace', 'name', 'content', 'created_at', 'updated_at'}

    def test_list_excludes_files_of_other_workspaces(self, other_client, workspace):
        assert other_client.get(self.URL).data == []
        assert other_client.get(self.URL, {'workspace': str(workspace.id)}).data == []

    def test_create_file(self, auth_client, workspace):
        res = auth_client.post(self.URL, {'workspace': str(workspace.id), 'name': 'util.py', 'content': 'x = 1'}, format='json')
        assert res.status_code == 201
        assert res.data['workspace'] == workspace.id
        assert workspace.files.filter(name='util.py', content='x = 1').exists()

    def test_member_can_create_file(self, other_client, workspace, membership):
        res = other_client.post(self.URL, {'workspace': str(workspace.id), 'name': 'b.py'}, format='json')
        assert res.status_code == 201

    def test_cannot_create_file_in_foreign_workspace(self, other_client, workspace):
        res = other_client.post(self.URL, {'workspace': str(workspace.id), 'name': 'evil.py'}, format='json')
        assert res.status_code == 400
        assert 'workspace' in res.data
        assert not workspace.files.filter(name='evil.py').exists()

    def test_create_requires_name(self, auth_client, workspace):
        res = auth_client.post(self.URL, {'workspace': str(workspace.id)}, format='json')
        assert res.status_code == 400

    @pytest.mark.xfail(strict=True, reason='Known bug: duplicate names hit the DB unique constraint (500) instead of a 400')
    def test_duplicate_file_name_rejected(self, auth_client, workspace):
        res = auth_client.post(self.URL, {'workspace': str(workspace.id), 'name': 'main.py'}, format='json')
        assert res.status_code == 400


class TestCodeStorage:
    def url(self, f):
        return f'/api/workspaces/files/{f.id}/'

    def test_save_and_reload_code(self, auth_client, workspace):
        f = workspace.files.get()
        code = 'def add(a, b):\n    return a + b'
        before = f.updated_at

        assert auth_client.patch(self.url(f), {'content': code}, format='json').status_code == 200

        res = auth_client.get(self.url(f))
        assert res.data['content'] == code
        f.refresh_from_db()
        assert f.updated_at > before

    @pytest.mark.xfail(strict=True, reason='Known bug: DRF CharField trims whitespace, so saved code loses leading indentation/trailing newlines')
    def test_save_preserves_surrounding_whitespace(self, auth_client, workspace):
        f = workspace.files.get()
        code = '    indented_first_line()\n'
        auth_client.patch(self.url(f), {'content': code}, format='json')
        assert auth_client.get(self.url(f)).data['content'] == code

    def test_member_can_save(self, other_client, workspace, membership):
        f = workspace.files.get()
        assert other_client.patch(self.url(f), {'content': 'y'}, format='json').status_code == 200

    def test_workspace_cannot_be_reassigned(self, auth_client, user, workspace):
        f = workspace.files.get()
        target = Workspace.objects.create(name='t', owner=user)
        auth_client.patch(self.url(f), {'workspace': str(target.id)}, format='json')
        f.refresh_from_db()
        assert f.workspace == workspace

    @pytest.mark.parametrize('method', ['get', 'patch', 'delete'])
    def test_non_member_cannot_touch_file(self, other_client, workspace, method):
        f = workspace.files.get()
        res = getattr(other_client, method)(self.url(f), {'content': 'pwned'}, format='json')
        assert res.status_code == 404
        f.refresh_from_db()
        assert f.content == 'print("hi")\n'

    def test_delete_file(self, auth_client, workspace):
        f = workspace.files.get()
        assert auth_client.delete(self.url(f)).status_code == 204
        assert not workspace.files.exists()
