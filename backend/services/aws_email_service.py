import boto3
from django.conf import settings
from utils.exceptions import EmailSendError


class AWSEmailService:
    """AWS SES email service - more reliable for production"""
    
    @staticmethod
    def send_otp_email(email: str, otp: str) -> None:
        """
        Send OTP using AWS SES
        
        Cost: $0.10 per 1,000 emails (after 62,000 free emails/month)
        """
        client = boto3.client(
            'ses',
            region_name='us-east-1',  # or your preferred region
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        
        try:
            client.send_email(
                Source=settings.DEFAULT_FROM_EMAIL,
                Destination={'ToAddresses': [email]},
                Message={
                    'Subject': {'Data': 'CineRater - Your Login OTP'},
                    'Body': {
                        'Text': {
                            'Data': f'''
Hello,

Your OTP for CineRater login is: {otp}

This code will expire in 5 minutes.

If you didn't request this, please ignore this email.

- CineRater Team
                            '''
                        }
                    }
                }
            )
        except Exception as e:
            raise EmailSendError(f"Failed to send email via AWS SES: {str(e)}")