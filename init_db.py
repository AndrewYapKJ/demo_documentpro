#!/usr/bin/env python
# -*- encoding: utf-8 -*-
"""
Database initialization script for production deployment
This script creates the database (if needed) and all tables
"""

import os
import sys

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()
import logging

logger = logging.getLogger(__name__)

def setup_logging():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')

setup_logging()

def create_database_if_not_exists():
    """Create the DocumentPro database if it doesn't exist"""
    import pyodbc
    from urllib.parse import urlparse, parse_qs
    
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        logger.error('DATABASE_URL environment variable not set')
        return False
    
    # Parse the connection string
    parsed = urlparse(database_url)
    params = parse_qs(parsed.query)
    
    # Extract connection details
    username = parsed.username
    password = parsed.password
    hostname = parsed.hostname
    port = parsed.port or 1433
    database = parsed.path.lstrip('/')
    driver = params.get('driver', ['ODBC Driver 18 for SQL Server'])[0]
    trust_cert = 'TrustServerCertificate=yes' if 'TrustServerCertificate' in parsed.query else ''
    
    # Connect to master database first
    conn_str = f'DRIVER={{{driver}}};SERVER={hostname},{port};DATABASE=master;UID={username};PWD={password}'
    if trust_cert:
        conn_str += f';{trust_cert}'
    
    try:
        logger.info('Connecting to SQL Server at %s...', hostname)
        conn = pyodbc.connect(conn_str, autocommit=True)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(f"SELECT name FROM sys.databases WHERE name = '{database}'")
        if cursor.fetchone():
            logger.info('Database %s already exists', database)
        else:
            # Create the database
            logger.info('Creating database %s...', database)
            cursor.execute(f'CREATE DATABASE {database}')
            logger.info('Database %s created successfully!', database)
        
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        logger.exception('Error creating database: %s', e)
        return False

def create_tables():
    """Create all application tables"""
    from apps import create_app, db
    from apps.config import Config
    
    try:
        logger.info('Creating application tables...')
        app = create_app(Config)
        with app.app_context():
            db.create_all()
            logger.info('Database tables created successfully!')
        return True
    except Exception as e:
        logger.exception('Error creating tables: %s', e)
        return False

if __name__ == '__main__':
    logger.info('%s', '=' * 60)
    logger.info('Database Initialization Script')
    logger.info('%s', '=' * 60)
    
    # Step 1: Create database if needed
    if not create_database_if_not_exists():
        logger.error('Failed to create database')
        sys.exit(1)
    
    # Step 2: Create tables
    if not create_tables():
        logger.error('Failed to create tables')
        sys.exit(1)
    
    logger.info('%s', '=' * 60)
    logger.info('Database initialization completed successfully!')
    logger.info('%s', '=' * 60)
