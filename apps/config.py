# -*- encoding: utf-8 -*-
"""
Copyright (c) 2019 - present AppSeed.us
"""

import os, random, string
import logging

logger = logging.getLogger(__name__)

class Config(object):

    basedir = os.path.abspath(os.path.dirname(__file__))

    # Assets Management
    ASSETS_ROOT = os.getenv('ASSETS_ROOT', '/static/assets')  
    
    # Set up the App SECRET_KEY
    SECRET_KEY  = os.getenv('SECRET_KEY', None)
    if not SECRET_KEY:
        SECRET_KEY = ''.join(random.choice( string.ascii_lowercase  ) for i in range( 32 ))

    # Master API Key for administrative access
    # Set this in your environment variables or .env file
    MASTER_API_KEY = os.getenv('MASTER_API_KEY', None)

    # Social AUTH context
    SOCIAL_AUTH_GITHUB  = False

    GITHUB_ID      = os.getenv('GITHUB_ID'    , None)
    GITHUB_SECRET  = os.getenv('GITHUB_SECRET', None)

    # Enable/Disable Github Social Login    
    if GITHUB_ID and GITHUB_SECRET:
         SOCIAL_AUTH_GITHUB  = True        

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Check for DATABASE_URL environment variable first (for production/Docker)
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', None)
    
    # If no DATABASE_URL, build from DB_CONFIG (for local development)
    if not SQLALCHEMY_DATABASE_URI:
        # Try to detect which ODBC driver is available
        import pyodbc
        available_drivers = [d for d in pyodbc.drivers() if 'SQL Server' in d]
        
        # Prefer Driver 18, fallback to 17
        driver = None
        if 'ODBC Driver 18 for SQL Server' in available_drivers:
            driver = 'ODBC Driver 18 for SQL Server'
        elif 'ODBC Driver 17 for SQL Server' in available_drivers:
            driver = 'ODBC Driver 17 for SQL Server'
        else:
            # Fallback to any available SQL Server driver
            driver = available_drivers[0] if available_drivers else 'ODBC Driver 18 for SQL Server'
        
        DB_CONFIG = {
            'driver': driver,
            'server': 'localhost',
            'database': 'DocumentPro',
            'username': 'sa',
            'password': 'VeryStr0ngP@ssw0rd'
        }
        
        # Primary database URI (SQL Server) - URL encode the password
        from urllib.parse import quote_plus
        encoded_password = quote_plus(DB_CONFIG['password'])
        driver_param = quote_plus(driver)
        SQLALCHEMY_DATABASE_URI = (
            f"mssql+pyodbc://{DB_CONFIG['username']}:{encoded_password}@"
            f"{DB_CONFIG['server']}/{DB_CONFIG['database']}?driver={driver_param}&TrustServerCertificate=yes"
        )
        logger.info("Using fallback DB_CONFIG to build SQLALCHEMY_DATABASE_URI")
    
class ProductionConfig(Config):
    DEBUG = False

    # Security
    SESSION_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_DURATION = 3600
    
    # Session timeout - auto logout after 1 hour of inactivity
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour in seconds
    SESSION_COOKIE_SECURE = False  # Set to True when using HTTPS
    SESSION_REFRESH_EACH_REQUEST = True  # Reset timer on each request

class DebugConfig(Config):
    DEBUG = True

# Load all possible configurations
config_dict = {
    'Production': ProductionConfig,
    'Debug'     : DebugConfig
}
