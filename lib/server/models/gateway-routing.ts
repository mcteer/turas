import type {LanguageModel} from "ai";

export const selectTurasGatewayModel = <T extends LanguageModel>(model: T) => ({
  model, modelOptions: { providerOptions: { gateway: { only: ['anthropic'] } } },
});
