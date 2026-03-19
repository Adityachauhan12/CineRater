class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded"""
    pass


class InvalidOTP(Exception):
    """Raised when OTP is invalid"""
    pass


class OTPExpired(Exception):
    """Raised when OTP has expired"""
    pass


class EmailSendError(Exception):
    """Raised when email sending fails"""
    pass


class AuthenticationError(Exception):
    """Raised when authentication fails"""
    pass
