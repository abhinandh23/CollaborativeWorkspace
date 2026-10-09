import uuid

import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator

from core.asgi import application
from workspace.models import Message

# Consumers save chat through database_sync_to_async, which needs committed data
pytestmark = pytest.mark.django_db(transaction=True)


async def connect(workspace_id):
    comm = WebsocketCommunicator(application, f'/ws/workspace/{workspace_id}/')
    connected, _ = await comm.connect()
    assert connected
    return comm


async def test_connects_to_workspace_route():
    comm = await connect(uuid.uuid4())
    await comm.disconnect()


async def test_rejects_unknown_route():
    comm = WebsocketCommunicator(application, '/ws/workspace/not_a_uuid!/')
    with pytest.raises(ValueError, match='No route found'):
        await comm.connect()


async def test_code_update_is_broadcast_to_everyone_in_workspace():
    ws_id = uuid.uuid4()
    alice, bob = await connect(ws_id), await connect(ws_id)

    await alice.send_json_to({'type': 'code_update', 'file_id': 'f1', 'code': 'print(42)'})

    expected = {'type': 'code_update', 'file_id': 'f1', 'code': 'print(42)'}
    assert await bob.receive_json_from() == expected
    # The sender is in the group too, so it receives its own update back
    assert await alice.receive_json_from() == expected
    await alice.disconnect()
    await bob.disconnect()


async def test_other_workspaces_are_isolated():
    alice, stranger = await connect(uuid.uuid4()), await connect(uuid.uuid4())

    await alice.send_json_to({'type': 'code_update', 'file_id': 'f1', 'code': 'secret'})

    await alice.receive_json_from()
    assert await stranger.receive_nothing(timeout=0.2)
    await alice.disconnect()
    await stranger.disconnect()


async def test_chat_message_is_broadcast_and_persisted(user, workspace):
    alice, bob = await connect(workspace.id), await connect(workspace.id)

    await alice.send_json_to({
        'type': 'chat_message', 'content': 'hello team',
        'sender_id': str(user.id), 'sender_email': user.email,
    })

    assert await bob.receive_json_from() == {
        'type': 'chat_message', 'content': 'hello team',
        'sender_id': str(user.id), 'sender_email': user.email,
    }
    saved = await database_sync_to_async(lambda: list(Message.objects.values('content', 'sender_id', 'workspace_id')))()
    assert saved == [{'content': 'hello team', 'sender_id': user.id, 'workspace_id': workspace.id}]
    await alice.disconnect()
    await bob.disconnect()


async def test_chat_without_sender_defaults_email_and_saves_anonymously(workspace):
    comm = await connect(workspace.id)

    await comm.send_json_to({'type': 'chat_message', 'content': 'anon'})

    assert (await comm.receive_json_from())['sender_email'] == 'Unknown'
    msg = await database_sync_to_async(Message.objects.get)()
    assert msg.sender_id is None
    await comm.disconnect()


async def test_chat_for_unknown_workspace_is_broadcast_but_not_saved():
    comm = await connect(uuid.uuid4())

    await comm.send_json_to({'type': 'chat_message', 'content': 'lost'})

    assert (await comm.receive_json_from())['content'] == 'lost'
    assert await database_sync_to_async(Message.objects.count)() == 0
    await comm.disconnect()


async def test_file_event_is_broadcast():
    ws_id = uuid.uuid4()
    alice, bob = await connect(ws_id), await connect(ws_id)

    await alice.send_json_to({'type': 'file_event', 'action': 'create', 'file_id': 'f9'})

    assert await bob.receive_json_from() == {'type': 'file_event', 'action': 'create', 'file_id': 'f9'}
    await alice.disconnect()
    await bob.disconnect()


async def test_bad_input_does_not_kill_the_connection():
    comm = await connect(uuid.uuid4())

    await comm.send_to(text_data='this is not json')
    await comm.send_json_to({'type': 'something_unknown'})
    assert await comm.receive_nothing(timeout=0.2)

    # Still alive and working afterwards
    await comm.send_json_to({'type': 'code_update', 'file_id': 'f', 'code': 'x'})
    assert (await comm.receive_json_from())['code'] == 'x'
    await comm.disconnect()


async def test_disconnected_clients_leave_the_group():
    ws_id = uuid.uuid4()
    alice, bob = await connect(ws_id), await connect(ws_id)
    await bob.disconnect()

    await alice.send_json_to({'type': 'code_update', 'file_id': 'f', 'code': 'x'})

    assert (await alice.receive_json_from())['code'] == 'x'
    assert await alice.receive_nothing(timeout=0.2)
    await alice.disconnect()
