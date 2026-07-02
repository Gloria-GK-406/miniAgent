import { useEffect, useState } from "react";
import type { CLIAppRuntime, CLIState } from "../runtime/types.js";

export function useRuntime(runtime: CLIAppRuntime): { state: CLIState } {
  const [state, setState] = useState(runtime.getState());

  useEffect(() => runtime.subscribe((event) => {
    if (event.type === "state") {
      setState(event.state);
    }
  }), [runtime]);

  return { state };
}
