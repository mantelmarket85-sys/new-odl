import { useEffect, useRef } from "react";

/* =========================================================================
 * useRealtime — subscribe to a Server-Sent Events stream.
 *
 *   useRealtime(api.teacher.eventsUrl, {
 *     assignment: (data) => reload(),
 *     message:    (data) => { ... },
 *   });
 *
 * - `urlFactory` is a function returning the SSE URL (so the auth token is
 *   resolved lazily at connect time).
 * - `handlers` maps event names → callbacks. A special "*" handler receives
 *   every message.
 * - Automatically reconnects (EventSource does this natively) and cleans up
 *   on unmount. Handlers are kept in a ref so re-renders don't reconnect.
 * ======================================================================= */
export default function useRealtime(urlFactory, handlers = {}, deps = []) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof urlFactory !== "function") return undefined;
    let es;
    try {
      es = new EventSource(urlFactory());
    } catch (_) {
      return undefined;
    }

    const names = Object.keys(handlersRef.current || {});
    const listeners = [];

    const attach = (name) => {
      const fn = (evt) => {
        let data = null;
        try { data = evt.data ? JSON.parse(evt.data) : null; } catch (_) { data = evt.data; }
        const h = handlersRef.current[name];
        if (typeof h === "function") h(data, evt);
        const star = handlersRef.current["*"];
        if (name !== "*" && typeof star === "function") star(data, evt, name);
      };
      es.addEventListener(name, fn);
      listeners.push([name, fn]);
    };

    names.filter((n) => n !== "*").forEach(attach);

    // The "*" handler also catches the default (unnamed) message event.
    if (handlersRef.current["*"]) {
      const fn = (evt) => {
        let data = null;
        try { data = evt.data ? JSON.parse(evt.data) : null; } catch (_) { data = evt.data; }
        handlersRef.current["*"](data, evt, "message");
      };
      es.onmessage = fn;
    }

    return () => {
      listeners.forEach(([name, fn]) => es.removeEventListener(name, fn));
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
