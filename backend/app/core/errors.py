"""
Centralised error handling for GPFLOW.

Raise GPFlowError anywhere in the app; the exception handler in main.py
converts it to the standard JSON envelope:
    { "detail": "Human readable message", "code": "MACHINE_READABLE_CODE" }
"""

from fastapi import status


class GPFlowError(Exception):
    def __init__(self, status_code: int, detail: str, code: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


# ── Convenience constructors ──────────────────────────────────────────────────

def email_taken() -> GPFlowError:
    return GPFlowError(status.HTTP_409_CONFLICT, "Email already registered", "EMAIL_TAKEN")

def phone_taken() -> GPFlowError:
    return GPFlowError(status.HTTP_409_CONFLICT, "Phone number already registered", "PHONE_TAKEN")

def invalid_credentials() -> GPFlowError:
    return GPFlowError(status.HTTP_401_UNAUTHORIZED, "Invalid email or password", "INVALID_CREDENTIALS")

def token_expired() -> GPFlowError:
    return GPFlowError(status.HTTP_401_UNAUTHORIZED, "Token has expired", "TOKEN_EXPIRED")

def token_invalid() -> GPFlowError:
    return GPFlowError(status.HTTP_401_UNAUTHORIZED, "Token is invalid", "TOKEN_INVALID")

def not_found(resource: str = "Resource") -> GPFlowError:
    return GPFlowError(status.HTTP_404_NOT_FOUND, f"{resource} not found", "NOT_FOUND")

def forbidden() -> GPFlowError:
    return GPFlowError(status.HTTP_403_FORBIDDEN, "Access denied", "FORBIDDEN")

def validation_error(msg: str) -> GPFlowError:
    return GPFlowError(status.HTTP_422_UNPROCESSABLE_ENTITY, msg, "VALIDATION_ERROR")

def rate_limited() -> GPFlowError:
    return GPFlowError(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests", "RATE_LIMITED")
