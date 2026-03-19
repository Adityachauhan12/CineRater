from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from django.contrib.auth import get_user_model
from accounts.serializers import (
    OTPSendSerializer, OTPVerifySerializer,
    EmailPasswordLoginSerializer, PasswordResetSerializer,
)
from services.auth_service import AuthService
from utils.exceptions import RateLimitExceeded, InvalidOTP, OTPExpired, EmailSendError
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


class OTPSendView(APIView):
    """Send OTP to user's email for login"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        logger.info(f"OTP Send request received: {request.data}")
        print(f"OTP Send request received: {request.data}")
        
        serializer = OTPSendSerializer(data=request.data)
        
        if not serializer.is_valid():
            logger.error(f"Validation error: {serializer.errors}")
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        email = serializer.validated_data['email']
        logger.info(f"Sending OTP to: {email}")
        print(f"Sending OTP to: {email}")
        
        try:
            AuthService.send_otp(email)
            logger.info(f"OTP sent successfully to: {email}")
            print(f"OTP sent successfully to: {email}")
            return Response({
                'success': True,
                'message': 'OTP sent successfully to your email'
            }, status=status.HTTP_200_OK)
            
        except RateLimitExceeded as e:
            logger.error(f"Rate limit exceeded for {email}: {str(e)}")
            return Response({
                'success': False,
                'error': 'rate_limit_exceeded',
                'message': str(e)
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
            
        except EmailSendError as e:
            logger.error(f"Email send error for {email}: {str(e)}")
            print(f"Email send error for {email}: {str(e)}")
            return Response({
                'success': False,
                'error': 'email_send_failed',
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        except Exception as e:
            logger.error(f"Unexpected error for {email}: {str(e)}")
            print(f"Unexpected error for {email}: {str(e)}")
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OTPVerifyView(APIView):
    """Verify OTP and return JWT tokens"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']
        
        try:
            result = AuthService.verify_otp(email, otp)
            return Response({
                'success': True,
                'access': result['access'],
                'refresh': result['refresh'],
                'is_new_user': result['is_new_user']
            }, status=status.HTTP_200_OK)
            
        except RateLimitExceeded as e:
            return Response({
                'success': False,
                'error': 'rate_limit_exceeded',
                'message': str(e)
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
            
        except OTPExpired as e:
            return Response({
                'success': False,
                'error': 'otp_expired',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
            
        except InvalidOTP as e:
            return Response({
                'success': False,
                'error': 'invalid_otp',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailPasswordLoginView(APIView):
    """Login with email and password"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = EmailPasswordLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({
                'success': False,
                'error': 'invalid_credentials',
                'message': 'Invalid email or password.',
            }, status=status.HTTP_401_UNAUTHORIZED)

        if not user.check_password(password):
            return Response({
                'success': False,
                'error': 'invalid_credentials',
                'message': 'Invalid email or password.',
            }, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({
                'success': False,
                'error': 'account_inactive',
                'message': 'Your account is inactive.',
            }, status=status.HTTP_403_FORBIDDEN)

        from django.utils import timezone
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        tokens = AuthService.generate_jwt_tokens(user)
        return Response({
            'success': True,
            'access': tokens['access'],
            'refresh': tokens['refresh'],
        }, status=status.HTTP_200_OK)


class ForgotPasswordSendOTPView(APIView):
    """Send password-reset OTP (only to existing accounts)"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OTPSendSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']

        # Only send reset OTP if account exists
        if not User.objects.filter(email=email).exists():
            # Return success anyway to avoid email enumeration
            return Response({
                'success': True,
                'message': 'If an account with this email exists, a reset code has been sent.',
            }, status=status.HTTP_200_OK)

        try:
            AuthService.send_reset_otp(email)
            return Response({
                'success': True,
                'message': 'Password reset OTP sent to your email.',
            }, status=status.HTTP_200_OK)
        except RateLimitExceeded as e:
            return Response({
                'success': False,
                'error': 'rate_limit_exceeded',
                'message': str(e),
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except EmailSendError as e:
            return Response({
                'success': False,
                'error': 'email_send_failed',
                'message': str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"ForgotPasswordSendOTP error: {e}")
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PasswordResetView(APIView):
    """Verify reset OTP and set a new password"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']
        new_password = serializer.validated_data['new_password']

        # Verify OTP using existing auth service
        try:
            stored_otp = AuthService.get_otp_from_redis(email)
            if stored_otp is None:
                return Response({
                    'success': False,
                    'error': 'otp_expired',
                    'message': 'OTP has expired. Please request a new one.',
                }, status=status.HTTP_400_BAD_REQUEST)

            if stored_otp != otp:
                AuthService.increment_verify_attempts(email)
                return Response({
                    'success': False,
                    'error': 'invalid_otp',
                    'message': 'Invalid OTP. Please try again.',
                }, status=status.HTTP_400_BAD_REQUEST)

            # OTP is valid — set new password
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                return Response({
                    'success': False,
                    'error': 'not_found',
                    'message': 'No account found with this email.',
                }, status=status.HTTP_404_NOT_FOUND)

            user.set_password(new_password)
            user.save(update_fields=['password'])

            # Clear OTP and attempts
            from django.core.cache import cache
            cache.delete(f"otp:{email}")
            AuthService.clear_verify_attempts(email)

            return Response({
                'success': True,
                'message': 'Password reset successfully. You can now log in.',
            }, status=status.HTTP_200_OK)

        except RateLimitExceeded as e:
            return Response({
                'success': False,
                'error': 'rate_limit_exceeded',
                'message': str(e),
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except Exception as e:
            logger.error(f"PasswordReset error: {e}")
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


