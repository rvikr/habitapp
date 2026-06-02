import { requireNativeModule } from "expo";

type LaganWidgetModule = {
  updateAsync(snapshotJson: string): Promise<void>;
};

const LaganWidget = requireNativeModule<LaganWidgetModule>("LaganWidget");

export async function updateHomeWidgetSnapshot(snapshotJson: string): Promise<void> {
  await LaganWidget.updateAsync(snapshotJson);
}
