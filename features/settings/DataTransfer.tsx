"use client";

import { useRef, useState } from "react";
import { Button, Popconfirm } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { createDataTransferBackup, importDataTransferBackup, MAX_DATA_TRANSFER_LENGTH, parseDataTransferBackup, type TransferBackup } from "../../lib/cifi/data-transfer";

type Props = { language: "ko" | "en" };

function downloadBackup(backup: TransferBackup) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cifi-ultimate-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function DataTransfer({ language }: Props) {
  const ko = language === "ko";
  const t = (kr: string, en: string) => ko ? kr : en;
  const picker = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ name: string; backup: TransferBackup } | null>(null);
  const [status, setStatus] = useState("");
  const exportCurrent = () => {
    try { downloadBackup(createDataTransferBackup(window.localStorage)); setStatus(t("현재 데이터 백업 파일을 다운로드했어.", "Current data backup downloaded.")); }
    catch { setStatus(t("백업 파일을 만들지 못했어. 브라우저 저장 공간을 확인해줘.", "Could not create the backup. Check browser storage.")); }
  };
  const selectFile = async (file?: File) => {
    setCandidate(null);
    if (!file) return;
    if (file.size > MAX_DATA_TRANSFER_LENGTH) { setStatus(t("백업 파일이 너무 커.", "Backup file is too large.")); return; }
    try {
      const backup = parseDataTransferBackup(await file.text());
      setCandidate({ name: file.name, backup });
      setStatus(t(`가져올 파일: ${file.name}`, `Selected backup: ${file.name}`));
    } catch { setStatus(t("이 앱에서 만든 유효한 데이터 백업 파일이 아니야.", "This is not a valid backup created by this app.")); }
  };
  const importSelected = () => {
    if (!candidate) return;
    try {
      // Save the user's current app data before replacing it with the selected backup.
      downloadBackup(createDataTransferBackup(window.localStorage));
      importDataTransferBackup(window.localStorage, candidate.backup);
      window.location.reload();
    } catch { setStatus(t("가져오기에 실패했어. 현재 데이터를 확인하고 다운로드한 백업 파일을 보관해줘.", "Import failed. Check current data and keep the downloaded backup file.")); }
  };
  return <section className="settings-option settings-data-transfer">
    <span className="section-kicker">{t("데이터 이전", "Data transfer")}</span>
    <p>{t("가중치·플레이어 진행도·Mod Tree·Diamond/Token·Ship Install·테마 설정을 JSON 파일로 옮길 수 있어. 파일은 서버에 업로드되지 않아.", "Move weights, player progress, Mod Tree, Diamond/Token, Ship Install and appearance settings as a JSON file. It is not uploaded to a server.")}</p>
    <div className="settings-transfer-actions"><Button icon={<DownloadOutlined />} onClick={exportCurrent}>{t("모든 데이터 내보내기", "Export all data")}</Button><Button icon={<UploadOutlined />} onClick={() => picker.current?.click()}>{t("데이터 이전 파일 선택", "Choose transfer file")}</Button><input ref={picker} type="file" accept=".json,application/json" aria-label={t("데이터 이전 파일", "Data transfer file")} className="settings-transfer-file" onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ""; }} /></div>
    {candidate && <Popconfirm title={t("현재 데이터를 교체할까?", "Replace current data?")} description={t("현재 데이터를 먼저 백업 파일로 다운로드한 뒤, 이 사이트의 저장 데이터를 선택한 파일로 교체하고 새로고침해. 다른 사이트 데이터는 건드리지 않아.", "A backup of current data will download first. Then this site's saved data will be replaced and the page reloaded. Other sites are untouched.")} okText={t("백업 후 가져오기", "Back up and import")} cancelText={t("취소", "Cancel")} onConfirm={importSelected}><Button type="primary">{t("데이터 가져오기", "Import data")}</Button></Popconfirm>}
    <span role="status" className="settings-transfer-status">{status}</span>
  </section>;
}
