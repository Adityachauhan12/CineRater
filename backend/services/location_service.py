import requests
from typing import Optional
from django.core.cache import cache


class LocationService:
    """Service for IP-based location detection"""
    
    # Country code mapping
    REGION_MAPPING = {
        'IN': 'IN',    # India
        'US': 'US',    # United States
        'GB': 'US',    # United Kingdom → US content
        'CA': 'US',    # Canada → US content
        'AU': 'US',    # Australia → US content
    }
    
    CACHE_TTL = 86400  # 24 hours in seconds
    
    @staticmethod
    def get_region_from_ip(ip_address: str) -> str:
        """
        Get region from IP address with Redis caching
        
        Args:
            ip_address: IP address to lookup
            
        Returns:
            Region code: 'IN', 'US', or 'GLOBAL'
        """
        # Handle localhost/private IPs
        if ip_address in ['127.0.0.1', 'localhost', '::1'] or ip_address.startswith('192.168.'):
            return 'GLOBAL'
        
        # Check cache first
        cache_key = f"location:{ip_address}"
        cached_region = cache.get(cache_key)
        
        if cached_region:
            return cached_region
        
        # Call IP geolocation API
        try:
            response = requests.get(
                f"http://ip-api.com/json/{ip_address}",
                params={'fields': 'countryCode'},
                timeout=5
            )
            response.raise_for_status()
            
            data = response.json()
            country_code = data.get('countryCode', '')
            
            # Map country code to region
            region = LocationService.REGION_MAPPING.get(country_code, 'GLOBAL')
            
            # Cache result for 24 hours
            cache.set(cache_key, region, timeout=LocationService.CACHE_TTL)
            
            return region
            
        except (requests.exceptions.RequestException, KeyError, ValueError) as e:
            print(f"Location API Error: {e}")
            # Cache fallback result for shorter time (1 hour)
            cache.set(cache_key, 'GLOBAL', timeout=3600)
            return 'GLOBAL'
    
    @staticmethod
    def get_client_ip(request) -> str:
        """
        Extract client IP from Django request
        
        Args:
            request: Django request object
            
        Returns:
            Client IP address
        """
        # Check for forwarded IP (behind proxy/load balancer)
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # Take first IP if multiple
            ip = x_forwarded_for.split(',')[0].strip()
            return ip
        
        # Check for real IP header
        x_real_ip = request.META.get('HTTP_X_REAL_IP')
        if x_real_ip:
            return x_real_ip.strip()
        
        # Fallback to remote address
        return request.META.get('REMOTE_ADDR', '127.0.0.1')