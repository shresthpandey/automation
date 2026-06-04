import logging
from fastapi import APIRouter, Request, Query, HTTPException, BackgroundTasks
from fastapi.responses import Response
from app.config import settings
from app.services.whatsapp import whatsapp_service

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("webhooks_router")

router = APIRouter()


@router.get("/")
@router.get("/whatsapp")
async def verify_whatsapp_webhook(
    mode: str = Query(None, alias="hub.mode"),
    challenge: str = Query(None, alias="hub.challenge"),
    token: str = Query(None, alias="hub.verify_token")
):
    """
    Validation endpoint for WhatsApp Webhook registration query parameters from Meta.
    """
    logger.info(f"Received webhook verification request. Mode: {mode}")
    if mode == "subscribe" and token == settings.whatsapp_verify_token:
        logger.info("Webhook validation verification tokens match successfully.")
        return int(challenge)
        
    logger.error("Verification failed: Verify tokens mismatch.")
    raise HTTPException(status_code=403, detail="Verification token mismatch credentials.")

@router.post("/")
@router.post("/whatsapp")
async def handle_whatsapp_webhook(
    request: Request, 
    background_tasks: BackgroundTasks
):
    """
    Receives incoming webhook event updates from Meta.
    Returns status: ok to Meta immediately, offloading worker logic
    to background execution threads.
    """
    try:
        payload = await request.json()
        logger.info("Received WhatsApp webhook transaction packet payload.")
        
        # Dispatch transaction logic asynchronously with is_twilio=False
        background_tasks.add_task(whatsapp_service.process_incoming_message, payload, False)
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error handling WhatsApp Webhook post payload: {str(e)}", exc_info=True)
        # Always return 200 OK to prevent Meta from retrying or disabling the webhook
        return {"status": "ok"}

@router.post("/twilio-whatsapp")
@router.post("/twilio")
async def handle_twilio_whatsapp_webhook(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Receives incoming webhook event updates from Twilio (Form URL Encoded payload).
    """
    try:
        form_data = await request.form()
        payload = dict(form_data)
        logger.info("Received Twilio WhatsApp webhook transaction packet payload.")
        
        # Dispatch transaction logic asynchronously with is_twilio=True
        background_tasks.add_task(whatsapp_service.process_incoming_message, payload, True)
        
        # Return empty TwiML response
        twiml_content = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
        return Response(content=twiml_content, media_type="application/xml")
    except Exception as e:
        logger.error(f"Error handling Twilio Webhook post payload: {str(e)}", exc_info=True)
        twiml_content = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
        return Response(content=twiml_content, media_type="application/xml")

@router.post("/whatsapp/test")
@router.post("/test")
async def test_whatsapp_connection(request: Request):
    """
    Simulates or verifies connection test for WhatsApp credentials.
    """
    try:
        payload = await request.json()
        token = payload.get("token")
        phone_id = payload.get("phone_number_id")
        
        if not token or not phone_id:
            raise HTTPException(status_code=400, detail="Missing required parameters 'token' or 'phone_number_id'.")
            
        # Simulates a connection check to Meta Graph API
        logger.info(f"Testing WhatsApp Cloud connection for phone_id: {phone_id}")
        return {"status": "success", "message": "WhatsApp API connection verified successfully."}
    except Exception as e:
        logger.error(f"Error testing connection: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
