import { Screen } from "../screen";
import { Scanner } from "./scanner";

// Scan elevens QR-kode for at kvittere for en lektion.
export default function ScanPage() {
  return (
    <Screen
      title="Scan elev"
      sub="Kvittér for en lektion"
      back={{ href: "/laerer", label: "Kalender" }}
    >
      <Scanner />
      <p className="text-center text-sm text-muted">
        Bed eleven åbne Vixx og trykke &quot;Vis min QR-kode&quot;. Du kan også scanne koden med telefonens kamera.
      </p>
    </Screen>
  );
}
