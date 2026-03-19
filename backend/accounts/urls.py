from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import (
    OTPSendView, OTPVerifyView,
    EmailPasswordLoginView,
    ForgotPasswordSendOTPView, PasswordResetView,
)

urlpatterns = [
    # OTP-based login (passwordless)
    path('otp/send/', OTPSendView.as_view(), name='otp-send'),
    path('otp/verify/', OTPVerifyView.as_view(), name='otp-verify'),
    # Email + password login
    path('login/', EmailPasswordLoginView.as_view(), name='email-password-login'),
    # JWT token refresh
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    # Forgot password flow
    path('password/reset/send-otp/', ForgotPasswordSendOTPView.as_view(), name='forgot-password-send-otp'),
    path('password/reset/', PasswordResetView.as_view(), name='password-reset'),
]
