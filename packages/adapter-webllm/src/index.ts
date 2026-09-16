//actual adapter for webllm

import {CreateAdapter} from "@mlc-ai/webllm-adapter";

export default CreateAdapter({
  name: "webllm",
  runtime: "webgpu", 
})