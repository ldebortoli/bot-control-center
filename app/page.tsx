import type { Metadata } from "next";
import { ControlCenter } from "./control-center";
import { registeredBots } from "@/lib/control-center/bot-registry";

export const metadata: Metadata = {
  title: "Bot Control Center · Panel local",
  description:
    "Panel local y extensible para observar bots remotos, sus logs, triggers y bases SQLite.",
};

export default function Home() {
  return <ControlCenter bots={registeredBots} />;
}
