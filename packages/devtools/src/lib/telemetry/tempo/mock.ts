export const MOCK_TEMPO_RESPONSE = {
  "trace": {
    "resourceSpans": [
      {
        "resource": {
          "attributes": [
            {
              "key": "telemetry.sdk.language",
              "value": {
                "stringValue": "nodejs"
              }
            },
            {
              "key": "telemetry.sdk.name",
              "value": {
                "stringValue": "@effect/opentelemetry"
              }
            },
            {
              "key": "service.name",
              "value": {
                "stringValue": "example"
              }
            }
          ]
        },
        "scopeSpans": [
          {
            "scope": {
              "name": "example"
            },
            "spans": [
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "DYqtTSxNh9c=",
                "name": "signalgraph.publish",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091593000000",
                "endTimeUnixNano": "1786475091594183250",
                "attributes": [
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "orders.created"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "hxvItCWRk00=",
                "parentSpanId": "DYqtTSxNh9c=",
                "name": "signalgraph.consume",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091603000000",
                "endTimeUnixNano": "1786475091604772166",
                "attributes": [
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "orders.created"
                    }
                  },
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "analytics"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "6JbMlJ2a3KE=",
                "parentSpanId": "hxvItCWRk00=",
                "name": "signalgraph.handler",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091603737541",
                "endTimeUnixNano": "1786475091604044166",
                "attributes": [
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "analytics"
                    }
                  },
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "orders.created"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "izs3/McXtaM=",
                "parentSpanId": "DYqtTSxNh9c=",
                "name": "signalgraph.consume",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091606963041",
                "endTimeUnixNano": "1786475091607970625",
                "attributes": [
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "orders.created"
                    }
                  },
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "billing"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "SvTEDSgLyUs=",
                "parentSpanId": "izs3/McXtaM=",
                "name": "signalgraph.handler",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091607071583",
                "endTimeUnixNano": "1786475091607929625",
                "attributes": [
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "billing"
                    }
                  },
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "orders.created"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "qYFXlnQt7es=",
                "parentSpanId": "SvTEDSgLyUs=",
                "name": "signalgraph.publish",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091607235416",
                "endTimeUnixNano": "1786475091607883583",
                "attributes": [
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "billing.completed"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156s7-15ptfqg2m2j-1g65f66nr0n"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "8iLQ9THUre4=",
                "parentSpanId": "qYFXlnQt7es=",
                "name": "signalgraph.consume",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091610732583",
                "endTimeUnixNano": "1786475091610996291",
                "attributes": [
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "billing.completed"
                    }
                  },
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "email"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156s7-15ptfqg2m2j-1g65f66nr0n"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              },
              {
                "traceId": "J+KkDClEoEWEKgsVCqMDTw==",
                "spanId": "97/kaILK1Ik=",
                "parentSpanId": "8iLQ9THUre4=",
                "name": "signalgraph.handler",
                "kind": "SPAN_KIND_INTERNAL",
                "startTimeUnixNano": "1786475091610835791",
                "endTimeUnixNano": "1786475091610943541",
                "attributes": [
                  {
                    "key": "signalgraph.consumer.name",
                    "value": {
                      "stringValue": "email"
                    }
                  },
                  {
                    "key": "signalgraph.message.name",
                    "value": {
                      "stringValue": "billing.completed"
                    }
                  },
                  {
                    "key": "signalgraph.message.id",
                    "value": {
                      "stringValue": "msp156s7-15ptfqg2m2j-1g65f66nr0n"
                    }
                  },
                  {
                    "key": "signalgraph.correlation.id",
                    "value": {
                      "stringValue": "msp156ru-1x6jubj089v-1owsf2a4f5j"
                    }
                  }
                ],
                "status": {
                  "code": "STATUS_CODE_OK"
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "metrics": {
    "inspectedBytes": "57996"
  }
}
