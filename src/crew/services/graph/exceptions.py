class ReturnCodeError(Exception): ...

class StopSession(Exception): 
    def __init__(self, *args, status: str | None = None):
        self.status = status

        super().__init__(*args)