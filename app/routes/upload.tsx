import React, { useState, type FormEvent } from "react";
import FileUploader from "~/components/FileUploader";
import Navbar from "~/components/Navbar";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router";
import { convertPdfToImage } from "~/lib/pdf2img";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions } from "../../constants";

const upload = () => {
  const { auth, isLoading, fs, ai, kv } = usePuterStore();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState(" ");
  const [file, setFile] = useState<File | null>(null);

  const handleFileSelect = (file: File | null) => {
    setFile(file);
  };

  const handleAnalyze = async ({
    companyName,
    jobTitle,
    jobDescription,
    file,
  }: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    file: File;
  }) => {
    setIsProcessing(true);

    try {
      // Check authentication
      if (!auth.isAuthenticated) {
        setStatusText("Error: Please sign in to upload files");
        return;
      }

      // Validate file type
      if (!file.type.includes('pdf')) {
        setStatusText("Error: Please upload a PDF file");
        return;
      }

      console.log("File details:", {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });

      setStatusText("Uploading the file...");
      let uploadedFile;
      try {
        uploadedFile = await fs.upload([file]);
        console.log("Uploaded file result:", uploadedFile);
        if (!uploadedFile) {
          setStatusText("Error: Failed to upload file - no result returned");
          return;
        }
      } catch (uploadError) {
        console.error("File upload error:", uploadError);
        setStatusText(`Error: Failed to upload file - ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
        return;
      }

      setStatusText("Converting to image...");
      const imageFile = await convertPdfToImage(file);
      console.log("Converted image:", imageFile);
      
      if (!imageFile.file) {
        console.error("PDF conversion failed:", imageFile.error);
        setStatusText(`Error: Failed to convert PDF to image - ${imageFile.error || 'Unknown error'}`);
        return;
      }

      // Validate the converted image file
      console.log("Image file details:", {
        name: imageFile.file.name,
        size: imageFile.file.size,
        type: imageFile.file.type,
        lastModified: imageFile.file.lastModified
      });

      if (imageFile.file.size === 0) {
        setStatusText("Error: Converted image file is empty");
        return;
      }

      setStatusText("Uploading the image...");
      console.log("Attempting to upload image file:", imageFile.file);
      let uploadedImage;
      try {
        uploadedImage = await fs.upload([imageFile.file]);
        console.log("Uploaded image result:", uploadedImage);
        
        if (!uploadedImage) {
          setStatusText("Error: Failed to upload image - no result returned");
          return;
        }
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        setStatusText(`Error: Failed to upload image - ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
        return;
      }

      setStatusText("Preparing data...");
      const uuid = generateUUID();
      const data = {
        id: uuid,
        resumePath: uploadedFile.path,
        imagePath: uploadedImage.path,
        companyName,
        jobTitle,
        jobDescription,
        feedback: "",
      };
      await kv.set(`resume:${uuid}`, JSON.stringify(data));

      setStatusText("Analyzing...");

      const feedback = await ai.feedback(
        uploadedFile.path,
        prepareInstructions({ jobTitle, jobDescription })
      );
      if (!feedback) {
        setStatusText("Error: Failed to analyze resume");
        return;
      }

      const feedbackText =
        typeof feedback.message.content === "string"
          ? feedback.message.content
          : feedback.message.content[0].text;

      data.feedback = JSON.parse(feedbackText);
      await kv.set(`resume:${uuid}`, JSON.stringify(data));
      setStatusText("Analysis complete, redirecting...");
      navigate(`/resume/${uuid}`);
      console.log(data);
    } catch (error) {
      console.error("Error in handleAnalyze:", error);
      setStatusText(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget.closest("form");
    if (!form) return;
    const formData = new FormData(form);

    const companyName = formData.get("company-name") as string;
    const jobTitle = formData.get("job-title") as string;
    const jobDescription = formData.get("job-description") as string;

    if (!file) return;
    handleAnalyze({ companyName, jobTitle, jobDescription, file });

    console.log({ companyName, jobTitle, jobDescription, file });
  };

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar />

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Smart feedback for your dream job</h1>
          {isProcessing ? (
            <>
              <h2>{statusText}</h2>
              <img src="/images/resume-scan.gif" className="w-full" />
            </>
          ) : (
            <h2>Drop your resume for an ATS score and improvement tips</h2>
          )}
          {!isProcessing && (
            <form
              id="upload-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 mt-8"
            >
              <div className="form-div">
                <label htmlFor="company-name">Company Name</label>
                <input
                  type="text"
                  name="company-name"
                  placeholder="Company Name"
                  id="company-name"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-title">Job Title</label>
                <input
                  type="text"
                  name="job-title"
                  placeholder="Job Title"
                  id="job-title"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-description">Job Description</label>
                <textarea
                  rows={5}
                  name="job-description"
                  placeholder="Job Description"
                  id="job-description"
                />
              </div>

              <div className="form-div">
                <label htmlFor="uploader">Upload Resume</label>
                <FileUploader onFileSelect={handleFileSelect} />
              </div>

              <button className="primary-button" type="submit">
                Analyze Resume
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default upload;
