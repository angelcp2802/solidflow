import { writeFileSync } from 'node:fs';

// Original analytic semidisc revolved around sketch local Y; no imported geometry.
const document = {
  "version": 1,
  "id": "sphere-revolve-original",
  "name": "Original R3 sphere from a semicircle",
  "units": "mm",
  "createdAt": "2026-10-16T00:00:00.000Z",
  "updatedAt": "2026-10-16T00:00:00.000Z",
  "features": [
    {
      "id": "sphere-profile",
      "name": "Original right semicircle and diameter",
      "type": "sketch",
      "plane": "XY",
      "offset": 0,
      "suppressed": false,
      "profile": {
        "kind": "entities",
        "points": [
          {
            "id": "south",
            "x": 0,
            "y": -3
          },
          {
            "id": "north",
            "x": 0,
            "y": 3
          }
        ],
        "entities": [
          {
            "id": "semicircle",
            "type": "arc",
            "construction": false,
            "center": "origin",
            "start": "south",
            "end": "north",
            "clockwise": false
          },
          {
            "id": "diameter",
            "type": "line",
            "construction": false,
            "start": "north",
            "end": "south"
          }
        ],
        "constraints": []
      }
    },
    {
      "id": "sphere-revolve",
      "name": "Original full revolution",
      "type": "revolve",
      "sketchId": "sphere-profile",
      "angle": 360,
      "suppressed": false,
      "bodyOperation": {
        "mode": "new",
        "bodyId": "sphere-body"
      }
    }
  ]
};

writeFileSync(new URL('../../src/cad/fixtures/sphere-revolve-original.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
