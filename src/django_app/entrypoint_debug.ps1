# Run database migrations
Write-Output "Activate venv (Chose your venv)"
venv/Scripts/activate.ps1

Write-Output "Applying database migrations..."
python manage.py migrate

# Fix PostgreSQL sequences for all tables
Write-Output "Fixing PostgreSQL sequences..."
python manage.py fix_sequences

# Upload models (custom command)
Write-Output "Uploading models..."
python manage.py upload_models

# Collect static files for production server
Write-Output "Collects static"
python manage.py collectstatic --noinput

# Start Redis listener in the background
Write-Output "Starting Redis listener..."
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "manage.py listen_redis"

# Start Redis cache in the background
Write-Output "Starting Redis caching..."
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "manage.py cache_redis"

# Start Django application
Write-Output "Starting Django server..."
uvicorn django_app.asgi:application --reload --host 0.0.0.0 --port 8000
