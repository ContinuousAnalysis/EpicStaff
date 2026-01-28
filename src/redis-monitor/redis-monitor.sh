#!/bin/bash

# redis-monitor.sh
# Redis health monitoring script that restarts all services if Redis is unhealthy

# Configuration
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD}"
CHECK_INTERVAL="${CHECK_INTERVAL:-5}"
MAX_FAILURES="${MAX_FAILURES:-1}"
PROJECT_NAME=$(docker inspect "$HOSTNAME" --format '{{ index .Config.Labels "com.docker.compose.project" }}')

# Initialize failure counter
failure_count=0

cp /mount/.env /app/.env

echo "Starting Redis health monitor..."
echo "Redis Host: $REDIS_HOST"
echo "Redis Port: $REDIS_PORT"
echo "Check Interval: ${CHECK_INTERVAL}s"
echo "Max Failures: $MAX_FAILURES"
echo "Project name: $PROJECT_NAME"

# Function to restart all services
restart_services() {
    echo "$(date): Redis is unhealthy after $MAX_FAILURES consecutive failures. Restarting all services except crewdb, redis-monitor, frontend..."
    

    services_to_restart=$(docker-compose -p $PROJECT_NAME -f docker-compose.yaml config --services | grep -v -E '^(crewdb|redis-monitor|frontend)$' | tr '\n' ' ')
    
    if [ -z "$services_to_restart" ]; then
        echo "$(date): ERROR: No services found to restart"
        return 1
    fi

    echo "$(date): Services to restart: $services_to_restart"
    
    # Restart specific services using docker-compose
    if docker-compose -p $PROJECT_NAME --env-file "/app/.env" -f docker-compose.yaml stop $services_to_restart; then
        echo "$(date): Successfully stopped services: $services_to_restart"
        docker-compose -p $PROJECT_NAME --env-file "/app/.env" -f docker-compose.yaml up $services_to_restart -d
    else
        echo "$(date): ERROR: Failed to stop/up services"
        return 1
    fi
}

echo "$(date): Starting monitoring loop..."
while true; do
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        failure_count=0
    else
        echo "Redis is unhealthy"
        failure_count=$((failure_count + 1))
        
        # Check if we've reached the maximum failures
        if [ $failure_count -ge $MAX_FAILURES ]; then
            restart_services
            failure_count=0
            
            # this is important 
            echo "$(date): Waiting 150 seconds for services to restart..."
            sleep 150
        fi
    fi
    
    # Wait before next check
    sleep "$CHECK_INTERVAL"
done



