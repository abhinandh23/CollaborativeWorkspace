import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Workspace, Message
from django.contrib.auth import get_user_model

User = get_user_model()

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_id = self.scope['url_route']['kwargs']['workspace_id']
        self.room_group_name = f'workspace_{self.workspace_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'chat_message':
                content = data.get('content')
                sender_id = data.get('sender_id')
                
                # Save chat history to PostgreSQL
                await self.save_message(content, sender_id)

                # Broadcast to all users in the workspace
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'broadcast_chat_message',
                        'content': content,
                        'sender_id': sender_id,
                        'sender_email': data.get('sender_email', 'Unknown')
                    }
                )

            elif message_type == 'code_update':
                code = data.get('code')
                
                # Broadcast code to all users in the workspace
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'broadcast_code_update',
                        'code': code
                    }
                )
        except Exception as e:
            print("Error in WebSocket receive:", str(e))

    async def broadcast_chat_message(self, event):
        try:
            await self.send(text_data=json.dumps({
                'type': 'chat_message',
                'content': event.get('content'),
                'sender_id': event.get('sender_id'),
                'sender_email': event.get('sender_email', 'Unknown')
            }))
        except Exception as e:
            print("Error in broadcast_chat_message:", str(e))

    async def broadcast_code_update(self, event):
        try:
            await self.send(text_data=json.dumps({
                'type': 'code_update',
                'code': event.get('code')
            }))
        except Exception as e:
            print("Error in broadcast_code_update:", str(e))

    @database_sync_to_async
    def save_message(self, content, sender_id):
        # We wrap DB operations in database_sync_to_async because Django ORM is synchronous
        try:
            workspace = Workspace.objects.get(id=self.workspace_id)
            user = User.objects.get(id=sender_id) if sender_id else None
            Message.objects.create(workspace=workspace, sender=user, content=content)
        except Exception as e:
            print("Error saving message", e)
