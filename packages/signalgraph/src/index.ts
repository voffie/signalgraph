export { consumer } from "./Consumer.ts";

<<<<<<< HEAD
export { message } from "./Message.ts";
=======
export {
  message,
  type Message,
  type AnyMessage,
  type MessageSchema
} from "./message.ts";

export {
  consumer,
  type Consumer,
  type RetryPolicy
} from "./consumer.ts"
>>>>>>> 607b7d8 (feat: introduce retry and DLQ)
