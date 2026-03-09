from rest_framework import serializers
from .models import ActivityLog


class ActivityActorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source='full_name')
    role = serializers.CharField()


class ActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            'id', 'actor', 'actor_name', 'actor_role',
            'verb', 'description', 'target_type', 'target_id',
            'target_name', 'extra_data', 'created_at',
        ]

    def get_actor_name(self, obj):
        return obj.actor.full_name if obj.actor else 'System'

    def get_actor_role(self, obj):
        return obj.actor.role if obj.actor else ''
