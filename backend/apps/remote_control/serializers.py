from rest_framework import serializers
from .models import RemoteAgent, RemoteSession


class RemoteAgentSerializer(serializers.ModelSerializer):
    employee_name   = serializers.CharField(source='employee.full_name', read_only=True)
    employee_id     = serializers.IntegerField(source='employee.id',        read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')

    class Meta:
        model  = RemoteAgent
        fields = [
            'id', 'employee_id', 'employee_name', 'department_name',
            'machine_name', 'agent_token',
            'is_online', 'last_ping', 'created_at',
        ]
        read_only_fields = ['agent_token', 'is_online', 'last_ping', 'created_at']


class RemoteSessionSerializer(serializers.ModelSerializer):
    machine_name     = serializers.CharField(source='agent.machine_name',        read_only=True)
    agent_employee   = serializers.CharField(source='agent.employee.full_name',  read_only=True)
    controller_name  = serializers.CharField(source='controller.full_name',      read_only=True)

    class Meta:
        model  = RemoteSession
        fields = [
            'id', 'session_id',
            'agent', 'machine_name', 'agent_employee',
            'controller', 'controller_name',
            'status', 'fps', 'quality',
            'started_at', 'ended_at', 'created_at',
        ]
        read_only_fields = ['session_id', 'status', 'started_at', 'ended_at', 'created_at']
