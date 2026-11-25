import React from "react";
import { ConvoBriefApp } from "@/components/ConvoBriefApp";
import { formatUserDTO, getAuthenticatedUserRow } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let initialUser = null;
  try {
    const userRow = await getAuthenticatedUserRow();
    if (userRow) {
      initialUser = formatUserDTO(userRow);
    }
  } catch (err) {
    console.error("Failed to resolve initial user session:", err);
  }

  return <ConvoBriefApp initialUser={initialUser} />;
}
