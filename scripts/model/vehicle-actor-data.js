import {
  createActorReferenceArrayField,
  createIntegerField,
  createStringArrayField,
  createStringField,
  createSummarySchema
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;

export class VehicleActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["WET.DataModels.Vehicle"];

  static defineSchema() {
    return {
      summary: createSummarySchema(),
      details: new SchemaField({
        vehicleType: createStringField()
      }),
      capacity: new SchemaField({
        seats: createIntegerField()
      }),
      stats: new SchemaField({
        condition: createIntegerField(),
        maneuverability: createIntegerField(),
        damage: createIntegerField(),
        armor: createIntegerField()
      }),
      passengers: createActorReferenceArrayField(),
      problems: createStringArrayField()
    };
  }
}