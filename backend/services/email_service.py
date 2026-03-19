from django.core.mail import send_mail
from django.conf import settings
from utils.exceptions import EmailSendError


class EmailService:
    """Service for handling email operations"""
    
    @staticmethod
    def send_otp_email(email: str, otp: str) -> None:
        """
        Send OTP to user's email
        
        Args:
            email: Recipient email address
            otp: 6-digit OTP code
            
        Raises:
            EmailSendError: If email sending fails
        """
        subject = 'CineRater - Your Login OTP'
        message = f'''
Hello,

Your OTP for CineRater login is: {otp}

This code will expire in 5 minutes.

If you didn't request this, please ignore this email.

- CineRater Team
        '''
        
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception as e:
            raise EmailSendError(f"Failed to send email: {str(e)}")
