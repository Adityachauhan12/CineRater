#!/usr/bin/env python
import os
import django
from django.conf import settings

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.core.mail import send_mail

def test_email():
    try:
        print("Testing email configuration...")
        print(f"EMAIL_HOST_USER: {settings.EMAIL_HOST_USER}")
        print(f"EMAIL_HOST: {settings.EMAIL_HOST}")
        print(f"EMAIL_PORT: {settings.EMAIL_PORT}")
        
        result = send_mail(
            subject='Test Email from CineRater',
            message='This is a test email to verify email configuration.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=['adydelhi2003@gmail.com'],
            fail_silently=False,
        )
        print(f"Email sent successfully! Result: {result}")
        
    except Exception as e:
        print(f"Email sending failed: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_email()