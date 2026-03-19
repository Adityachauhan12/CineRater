import secrets
from django.core.cache import cache
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from services.email_service import EmailService
from utils.exceptions import RateLimitExceeded, InvalidOTP, OTPExpired

User = get_user_model()


class AuthService:
    """Service for handling authentication operations"""
    
    OTP_TTL = 300  # 5 minutes in seconds
    SEND_RATE_LIMIT = 3  # Max OTP sends per hour
    SEND_RATE_WINDOW = 3600  # 1 hour in seconds
    VERIFY_RATE_LIMIT = 5  # Max wrong attempts
    VERIFY_RATE_WINDOW = 300  # 5 minutes in seconds
    
    @staticmethod
    def generate_otp() -> str:
        """Generate a 6-digit OTP using cryptographically secure random"""
        return str(secrets.randbelow(900000) + 100000)
    
    @staticmethod
    def store_otp_in_redis(email: str, otp: str) -> None:
        """
        Store OTP in Redis with 5-minute TTL
        
        Args:
            email: User's email address
            otp: 6-digit OTP code
        """
        key = f"otp:{email}"
        cache.set(key, otp, timeout=AuthService.OTP_TTL)
    
    @staticmethod
    def get_otp_from_redis(email: str) -> str | None:
        """
        Retrieve OTP from Redis
        
        Args:
            email: User's email address
            
        Returns:
            OTP string or None if expired/not found
        """
        key = f"otp:{email}"
        return cache.get(key)
    
    @staticmethod
    def check_send_rate_limit(email: str) -> None:
        """
        Check if user has exceeded OTP send rate limit (3 sends/hour)
        
        Args:
            email: User's email address
            
        Raises:
            RateLimitExceeded: If rate limit exceeded
        """
        key = f"otp_send_count:{email}"
        count = cache.get(key, 0)
        
        if count >= AuthService.SEND_RATE_LIMIT:
            raise RateLimitExceeded("Too many OTP requests. Please try again later.")
        
        # Increment counter
        cache.set(key, count + 1, timeout=AuthService.SEND_RATE_WINDOW)
    
    @staticmethod
    def check_verify_rate_limit(email: str) -> None:
        """
        Check if user has exceeded OTP verify rate limit (5 wrong attempts)
        
        Args:
            email: User's email address
            
        Raises:
            RateLimitExceeded: If rate limit exceeded
        """
        key = f"otp_wrong:{email}"
        count = cache.get(key, 0)
        
        if count >= AuthService.VERIFY_RATE_LIMIT:
            raise RateLimitExceeded("Too many failed attempts. Please request a new OTP.")
    
    @staticmethod
    def increment_verify_attempts(email: str) -> None:
        """Increment wrong OTP attempt counter"""
        key = f"otp_wrong:{email}"
        count = cache.get(key, 0)
        cache.set(key, count + 1, timeout=AuthService.VERIFY_RATE_WINDOW)
    
    @staticmethod
    def clear_verify_attempts(email: str) -> None:
        """Clear wrong OTP attempt counter after successful verification"""
        key = f"otp_wrong:{email}"
        cache.delete(key)
    
    @staticmethod
    def generate_jwt_tokens(user: User) -> dict:
        """
        Generate JWT access and refresh tokens
        
        Args:
            user: User instance
            
        Returns:
            Dict with access and refresh tokens
        """
        refresh = RefreshToken.for_user(user)
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
    
    @staticmethod
    def send_otp(email: str) -> None:
        """
        Orchestrate OTP sending: rate check → generate → store → email
        
        Args:
            email: User's email address
            
        Raises:
            RateLimitExceeded: If rate limit exceeded
            EmailSendError: If email sending fails
        """
        # Check rate limit
        AuthService.check_send_rate_limit(email)
        
        # Generate OTP
        otp = AuthService.generate_otp()
        
        # Store in Redis
        AuthService.store_otp_in_redis(email, otp)
        
        # Send email
        EmailService.send_otp_email(email, otp)

    @staticmethod
    def send_reset_otp(email: str) -> None:
        """
        Send a password-reset OTP using a SEPARATE rate-limit counter
        so it doesn't share quota with login OTPs.

        Raises:
            RateLimitExceeded: If rate limit exceeded
            EmailSendError: If email sending fails
        """
        # Use a distinct key so reset sends don't consume login OTP quota
        key = f"reset_send_count:{email}"
        count = cache.get(key, 0)
        if count >= AuthService.SEND_RATE_LIMIT:
            raise RateLimitExceeded("Too many reset requests. Please try again later.")
        cache.set(key, count + 1, timeout=AuthService.SEND_RATE_WINDOW)

        otp = AuthService.generate_otp()
        AuthService.store_otp_in_redis(email, otp)
        EmailService.send_otp_email(email, otp)


    @staticmethod
    def verify_otp(email: str, otp: str) -> dict:
        """
        Verify OTP and return JWT tokens
        
        Args:
            email: User's email address
            otp: 6-digit OTP code
            
        Returns:
            Dict with access, refresh tokens and is_new_user flag
            
        Raises:
            RateLimitExceeded: If too many wrong attempts
            OTPExpired: If OTP not found in Redis
            InvalidOTP: If OTP doesn't match
        """
        # Check rate limit
        AuthService.check_verify_rate_limit(email)
        
        # Get OTP from Redis
        stored_otp = AuthService.get_otp_from_redis(email)
        
        if stored_otp is None:
            raise OTPExpired("OTP has expired or does not exist. Please request a new one.")
        
        # Compare OTPs
        if stored_otp != otp:
            AuthService.increment_verify_attempts(email)
            raise InvalidOTP("Invalid OTP. Please try again.")
        
        # Clear wrong attempts counter
        AuthService.clear_verify_attempts(email)
        
        # Get or create user
        user, is_new_user = User.objects.get_or_create(email=email)
        
        # Update last login
        from django.utils import timezone
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        
        # Generate JWT tokens
        tokens = AuthService.generate_jwt_tokens(user)
        
        # Delete OTP from Redis (one-time use)
        cache.delete(f"otp:{email}")
        
        return {
            **tokens,
            'is_new_user': is_new_user,
        }
