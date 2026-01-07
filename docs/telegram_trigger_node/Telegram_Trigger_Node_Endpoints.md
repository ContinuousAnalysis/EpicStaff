### Telegram Trigger API Endpoints

#### 1. Manage Trigger Nodes

**Endpoint:** `/api/telegram-trigger-nodes/`
**Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

Used to create and configure the Telegram Trigger node within a graph. This node acts as the entry point for the workflow.

* **POST / Create Payload:**
```json
{
  "node_name": "My Telegram Trigger",
  "telegram_bot_api_key": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "graph": 1,
  "fields": [
    {
      "parent": "message",
      "field_name": "text",
      "variable_path": "variables.telegram_data.user_input"
    },
    {
      "parent": "message",
      "field_name": "message_id",
      "variable_path": "variables.telegram_data.id"
    },
    {
      "parent": "callback_query",
      "field_name": "message",
      "variable_path": "variables.telegram_data.callback_message"
    }
  ]
}

```


* `graph`: ID of the graph this node belongs to.
* `fields`: A list of mappings defining which data from the Telegram payload should be extracted and where it should be stored in the graph's state.
* `parent`: The source object within the Telegram update payload (e.g., `message` or `callback_query`).
* `field_name`: The name of the field to extract from the specified `parent` object.
* `variable_path`: The user-provided path defining where to store the extracted value within the graph's variable state.



#### 2. Manage Trigger Fields

**Endpoint:** `/api/telegram-trigger-node-fields/`
**Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

Used for individual management of field mappings if not handled via the parent node endpoint.

* **Payload:**
```json
{
  "telegram_trigger_node": 5,
  "parent": "message",
  "field_name": "id",
  "variable_path": "chat_id"
}

```



#### 3. Retrieve Available Telegram Data Fields

**Endpoint:** `/api/telegram-trigger-available-fields/`
**Method:** `GET`

Returns a list of supported fields from the Telegram Update object that can be mapped to variables. Use this to populate dropdowns or autocomplete in the UI when configuring the node.

* **Response Example:**
```json
{
  "data": {
    "message": [
      {
        "field_name": "message_id",
        "field_type": "Integer",
        "description": "Unique message identifier inside this chat. In specific instances (e.g., message containing a video sent to a big chat), the server might automatically schedule a message instead of sending it immediately. In such cases, this field will be 0 and the relevant message will be unusable until it is actually sent"
      },
      {
        "field_name": "from",
        "field_type": "User",
        "description": "Optional. Sender of the message; may be empty for messages sent to channels. For backward compatibility, if the message was sent on behalf of a chat, the field contains a fake sender user in non-channel chats"
      },
      {
        "field_name": "date",
        "field_type": "Integer",
        "description": "Date the message was sent in Unix time. It is always a positive number, representing a valid date."
      },
      {
        "field_name": "chat",
        "field_type": "Chat",
        "description": "Chat the message belongs to"
      },
      {
        "field_name": "forward_origin",
        "field_type": "MessageOrigin",
        "description": "Optional. Information about the original message for forwarded messages"
      },
      {
        "field_name": "reply_to_message",
        "field_type": "Message",
        "description": "Optional. For replies in the same chat and message thread, the original message. Note that the Message object in this field will not contain further reply_to_message fields even if it itself is a reply."
      },
      {
        "field_name": "quote",
        "field_type": "TextQuote",
        "description": "Optional. For replies that quote part of the original message, the quoted part of the message"
      },
      {
        "field_name": "edit_date",
        "field_type": "Integer",
        "description": "Optional. Date the message was last edited in Unix time"
      },
      {
        "field_name": "is_from_offline",
        "field_type": "TRUE",
        "description": "Optional. True, if the message was sent by an implicit action, for example, as an away or a greeting business message, or as a scheduled message"
      },
      {
        "field_name": "text",
        "field_type": "String",
        "description": "Optional. For text messages, the actual UTF-8 text of the message"
      },
      {
        "field_name": "entities",
        "field_type": "Array[MessageEntity]",
        "description": "Optional. For text messages, special entities like usernames, URLs, bot commands, etc. that appear in the text"
      },
      {
        "field_name": "animation",
        "field_type": "Animation",
        "description": "Optional. Message is an animation, information about the animation. For backward compatibility, when this field is set, the document field will also be set"
      },
      {
        "field_name": "audio",
        "field_type": "Audio",
        "description": "Optional. Message is an audio file, information about the file"
      },
      {
        "field_name": "document",
        "field_type": "Document",
        "description": "Optional. Message is a general file, information about the file"
      },
      {
        "field_name": "photo",
        "field_type": "Array[PhotoSize]",
        "description": "Optional. Message is a photo, available sizes of the photo"
      },
      {
        "field_name": "sticker",
        "field_type": "Sticker",
        "description": "Optional. Message is a sticker, information about the sticker"
      },
      {
        "field_name": "story",
        "field_type": "Story",
        "description": "Optional. Message is a forwarded story"
      },
      {
        "field_name": "video",
        "field_type": "Video",
        "description": "Optional. Message is a video, information about the video"
      },
      {
        "field_name": "video_note",
        "field_type": "VideoNote",
        "description": "Optional. Message is a video note, information about the video message"
      },
      {
        "field_name": "voice",
        "field_type": "Voice",
        "description": "Optional. Message is a voice message, information about the file"
      },
      {
        "field_name": "caption",
        "field_type": "String",
        "description": "Optional. Caption for the animation, audio, document, paid media, photo, video or voice"
      },
      {
        "field_name": "caption_entities",
        "field_type": "Array[MessageEntity]",
        "description": "Optional. For messages with a caption, special entities like usernames, URLs, bot commands, etc. that appear in the caption"
      },
      {
        "field_name": "contact",
        "field_type": "Contact",
        "description": "Optional. Message is a shared contact, information about the contact"
      },
      {
        "field_name": "location",
        "field_type": "Location",
        "description": "Optional. Message is a shared location, information about the location"
      },
      {
        "field_name": "reply_markup",
        "field_type": "InlineKeyboardMarkup",
        "description": "Optional. Inline keyboard attached to the message. login_url buttons are represented as ordinary url buttons."
      }
    ],
    "callback_query": [
      {
        "field_name": "id",
        "field_type": "String",
        "description": "Unique identifier for this query"
      },
      {
        "field_name": "from",
        "field_type": "User",
        "description": "Sender"
      },
      {
        "field_name": "message",
        "field_type": "MaybeInaccessibleMessage",
        "description": "Optional. Message sent by the bot with the callback button that originated the query"
      },
      {
        "field_name": "data",
        "field_type": "String",
        "description": "Optional. Data associated with the callback button. Be aware that the message originated the query can contain no callback buttons with this data."
      }
    ]
  }
}
```



#### 4. Register Webhook

**Endpoint:** `/api/register-telegram-trigger/`
**Method:** `POST`

Activates the trigger by registering the webhook URL with the Telegram API. This must be called after the node is created and configured.

* **Payload:**
```json
{
  "telegram_trigger_node_id": 5
}

```


* **Behavior:**
* Retrieves the unique URL path generated for the node.
* Calls the Telegram `setWebhook` API using the stored bot API key.
* Returns `200 OK` on success or `503` if no webhook tunnel is available.
