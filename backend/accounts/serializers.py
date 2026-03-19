from rest_framework import serializers
import re


class OTPSendSerializer(serializers.Serializer):
    """Serializer for OTP send request"""
    email = serializers.EmailField(required=True)
    
    def validate_email(self, value):
        """Validate email format"""
        value = value.lower().strip()
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', value):
            raise serializers.ValidationError("Invalid email format")
        return value


class OTPVerifySerializer(serializers.Serializer):
    """Serializer for OTP verification request"""
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)
    
    def validate_email(self, value):
        """Validate email format"""
        value = value.lower().strip()
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', value):
            raise serializers.ValidationError("Invalid email format")
        return value
    
    def validate_otp(self, value):
        """Validate OTP is 6 digits"""
        if not value.isdigit():
            raise serializers.ValidationError("OTP must contain only digits")
        if len(value) != 6:
            raise serializers.ValidationError("OTP must be exactly 6 digits")
        return value


class EmailPasswordLoginSerializer(serializers.Serializer):
    """Serializer for email + password login"""
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)

    def validate_email(self, value):
        return value.lower().strip()


class PasswordResetSerializer(serializers.Serializer):
    """Serializer for resetting password via OTP"""
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)
    new_password = serializers.CharField(required=True, min_length=6, write_only=True)

    def validate_email(self, value):
        return value.lower().strip()

    def validate_otp(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("OTP must contain only digits")
        if len(value) != 6:
            raise serializers.ValidationError("OTP must be exactly 6 digits")
        return value
