"use client";
import { useEffect, useState } from "react";

/** Sends the browser's time zone with the form, so a new account starts in the right zone. */
export function TimezoneField() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    try { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* server default applies */ }
  }, []);
  return <input type="hidden" name="timezone" value={tz} readOnly />;
}
