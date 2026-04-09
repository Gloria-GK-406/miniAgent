export class StopException extends Error {
  constructor(message = "Agent stopped") {
    super(message);
    this.name = "StopException";
  }
}
