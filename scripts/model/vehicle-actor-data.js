import {
  createActorReferenceSchema,
  createIntegerField,
  createStringField
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;

export class VehicleActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["WET.DataModels.Vehicle"];

  static defineSchema() {
    return {
      owner: new SchemaField({
        actor: createActorReferenceSchema()
      }),
      details: new SchemaField({
        vehicleType: createStringField(),
        seats: createIntegerField(),
        state: createStringField()
      }),
      stats: new SchemaField({
        durability: createIntegerField(),
        maneuverability: createIntegerField(),
        damage: createIntegerField(),
        armor: createIntegerField()
      }),
      summary: new SchemaField({
        description: createStringField(),
        issues: createStringField()
      })
    };
  }
}