import subprocess
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.django_db

URL = '/api/workspaces/execute/'


def completed(stdout='', stderr=''):
    return subprocess.CompletedProcess(args=[], returncode=0, stdout=stdout, stderr=stderr)


@pytest.fixture
def run():
    # Never start real containers: every test sees a fake `docker run`
    with patch('workspace.views.subprocess.run') as mock:
        mock.return_value = completed(stdout='ok\n')
        yield mock


@pytest.mark.parametrize('filename, image, cpus, memory, timeout', [
    ('main.py', 'python:3.10-alpine', '0.5', '128m', 5),
    ('app.js', 'node:18-alpine', '0.5', '128m', 5),
    ('main.cpp', 'gcc:latest', '1.0', '256m', 10),
])
def test_runs_code_in_locked_down_container(auth_client, run, filename, image, cpus, memory, timeout):
    res = auth_client.post(URL, {'code': 'CODE', 'filename': filename}, format='json')

    assert res.status_code == 200
    assert res.data == {'stdout': 'ok\n', 'stderr': ''}
    cmd = run.call_args.args[0]
    assert cmd[:2] == ['docker', 'run']
    assert image in cmd
    # Sandbox limits: no network, capped CPU/memory/processes, non-root, removed afterwards
    for flag in ['--rm', f'--memory={memory}', f'--cpus={cpus}']:
        assert flag in cmd
    assert cmd[cmd.index('--network') + 1] == 'none'
    assert cmd[cmd.index('--user') + 1] == '1000:1000'
    assert cmd[cmd.index('--pids-limit') + 1] == '20'
    # Code goes through stdin, never through a shell string
    assert run.call_args.kwargs['input'] == 'CODE'
    assert run.call_args.kwargs['timeout'] == timeout
    assert 'shell' not in run.call_args.kwargs


def test_defaults_to_python(auth_client, run):
    auth_client.post(URL, {'code': 'print(1)'}, format='json')
    assert 'python:3.10-alpine' in run.call_args.args[0]


def test_returns_stderr(auth_client, run):
    run.return_value = completed(stderr='NameError: x')
    res = auth_client.post(URL, {'code': 'x', 'filename': 'main.py'}, format='json')
    assert res.status_code == 200
    assert res.data['stderr'] == 'NameError: x'


def test_unsupported_language(auth_client, run):
    res = auth_client.post(URL, {'code': 'puts 1', 'filename': 'main.rb'}, format='json')
    assert res.status_code == 400
    assert res.data['error'] == 'Unsupported language extension: .rb'
    run.assert_not_called()


def test_timeout(auth_client, run):
    run.side_effect = subprocess.TimeoutExpired(cmd='docker', timeout=5)
    res = auth_client.post(URL, {'code': 'while True: pass', 'filename': 'main.py'}, format='json')
    assert res.status_code == 400
    assert 'timed out' in res.data['error']


def test_docker_not_installed(auth_client, run):
    run.side_effect = FileNotFoundError('docker')
    res = auth_client.post(URL, {'code': 'print(1)', 'filename': 'main.py'}, format='json')
    assert res.status_code == 503
    assert 'Docker is not installed' in res.data['error']


def test_unexpected_error(auth_client, run):
    run.side_effect = RuntimeError('daemon exploded')
    res = auth_client.post(URL, {'code': 'print(1)', 'filename': 'main.py'}, format='json')
    assert res.status_code == 500
    assert res.data['error'] == 'daemon exploded'


def test_requires_authentication(api_client, run):
    assert api_client.post(URL, {'code': 'print(1)'}, format='json').status_code == 401
    run.assert_not_called()
