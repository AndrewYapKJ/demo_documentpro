# -*- encoding: utf-8 -*-


import os
from dotenv import load_dotenv

# Load environment variables from .env file FIRST
# Use explicit path to ensure .env is found
load_dotenv('.env')

from   flask_migrate import Migrate
try:
    from flask_minify import Minify
    _MINIFY_AVAILABLE = True
except Exception:
    # flask_minify (and htmlmin) may be absent on some Python versions.
    Minify = None
    _MINIFY_AVAILABLE = False
from   sys import exit

from apps.config import config_dict
from apps import create_app, db

# WARNING: Don't run with debug turned on in production!
DEBUG = (os.getenv('DEBUG', 'False') == 'True')

# The configuration
get_config_mode = 'Debug' if DEBUG else 'Production'

try:

    # Load the configuration using the default values
    app_config = config_dict[get_config_mode.capitalize()]

except KeyError:
    exit('Error: Invalid <config_mode>. Expected values [Debug, Production] ')

app = create_app(app_config)
Migrate(app, db)

if not DEBUG and _MINIFY_AVAILABLE and Minify is not None:
    Minify(app=app, html=True, js=False, cssless=False)
elif not DEBUG and not _MINIFY_AVAILABLE:
    # Minify unavailable — continue without HTML minification.
    app.logger.warning('flask_minify not available; skipping HTML minification')
    
if DEBUG:
    app.logger.info('DEBUG            = ' + str(DEBUG)             )
    app.logger.info('Page Compression = ' + 'FALSE' if DEBUG else 'TRUE' )
    app.logger.info('DBMS             = ' + app_config.SQLALCHEMY_DATABASE_URI)
    app.logger.info('ASSETS_ROOT      = ' + app_config.ASSETS_ROOT )

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
