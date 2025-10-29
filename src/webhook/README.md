# How to Run

## Step 1: Start Redis
The service requires a running Redis server. 

## Step 2: Run the Service
`python run.py`
to load variables from system environment 
OR
`python run.py --debug`
to load variables from `debug.env` file

## Testing
### Send a Test Webhook
`curl -X POST "https://<your-ngrok-url-here>/webhooks/test-123/" -H "Content-Type: application/json" -d '{"event": "test"}'`
OR
`curl -X POST "[http://127.0.0.1:8000/webhooks/test-123/](http://127.0.0.1:8000/webhooks/test-123/)" -H "Content-Type: application/json" -d '{"event": "test"}'`

### Note for Windows CMD Users: 
The cmd.exe terminal does not handle single quotes (') correctly. You must use double quotes (") and escape the inner quotes with backslashes (\):

`curl -X POST "[http://127.0.0.1:8000/webhooks/test-123/](http://127.0.0.1:8000/webhooks/test-123/)" -H "Content-Type: application/json" -d "{\"event\": \"test\"}"`

